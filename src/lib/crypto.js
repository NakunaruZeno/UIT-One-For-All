/**
 * UIT One For All — Shared AES-GCM 256-bit Credential Encryption & Storage Utility
 * Works in Service Worker (background), Content Scripts, Popup, and Dashboard.
 * Includes backwards compatibility with v1.5.0 storage keys (aes_key, uit_user, uit_pass_cipher, uit_pass_iv).
 */
(function (root) {
  'use strict';

  async function getOrCreateCryptoKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['uit_crypto_key'], async (res) => {
        try {
          if (res && res.uit_crypto_key) {
            const rawKey = new Uint8Array(res.uit_crypto_key);
            const key = await crypto.subtle.importKey(
              'raw',
              rawKey,
              { name: 'AES-GCM' },
              false,
              ['encrypt', 'decrypt']
            );
            resolve(key);
          } else {
            const key = await crypto.subtle.generateKey(
              { name: 'AES-GCM', length: 256 },
              true,
              ['encrypt', 'decrypt']
            );
            const exported = await crypto.subtle.exportKey('raw', key);
            const rawKeyArray = Array.from(new Uint8Array(exported));
            chrome.storage.local.set({ uit_crypto_key: rawKeyArray }, () => {
              resolve(key);
            });
          }
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async function encryptPassword(plainText) {
    const key = await getOrCreateCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    return {
      cipher: Array.from(new Uint8Array(cipherBuffer)),
      iv: Array.from(iv),
      encrypted: true
    };
  }

  async function decryptPassword(encryptedObj) {
    if (!encryptedObj || !encryptedObj.encrypted) {
      return typeof encryptedObj === 'string' ? encryptedObj : '';
    }
    try {
      const key = await getOrCreateCryptoKey();
      const iv = new Uint8Array(encryptedObj.iv);
      const cipherBytes = new Uint8Array(encryptedObj.cipher);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherBytes
      );
      return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
      console.error('[UITCrypto] Giải mã mật khẩu thất bại:', e);
      return '';
    }
  }

  async function decryptLegacyPassword(aesKeyJwk, cipherArr, ivArr) {
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        aesKeyJwk,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(ivArr) },
        key,
        new Uint8Array(cipherArr)
      );
      return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
      return '';
    }
  }

  async function getDecryptedAccount() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['uit_account', 'uit_user', 'uit_pass', 'uit_pass_cipher', 'uit_pass_iv', 'aes_key'],
        async (res) => {
          if (res && res.uit_account && res.uit_account.username) {
            const plainPassword = await decryptPassword(res.uit_account.password);
            resolve({
              username: res.uit_account.username,
              password: plainPassword
            });
            return;
          }

          // Fallback & auto-migrate from v1.5.0 keys if present
          if (res && res.uit_user) {
            let plainPassword = '';
            if (res.uit_pass_cipher && res.uit_pass_iv && res.aes_key) {
              plainPassword = await decryptLegacyPassword(
                res.aes_key,
                res.uit_pass_cipher,
                res.uit_pass_iv
              );
            } else if (res.uit_pass) {
              plainPassword = res.uit_pass;
            }

            if (plainPassword) {
              const encryptedPassword = await encryptPassword(plainPassword);
              chrome.storage.local.set({
                uit_account: {
                  username: res.uit_user,
                  password: encryptedPassword
                }
              });
            }

            resolve({
              username: res.uit_user,
              password: plainPassword
            });
            return;
          }

          resolve(null);
        }
      );
    });
  }

  root.UITCrypto = {
    getOrCreateCryptoKey,
    encryptPassword,
    decryptPassword,
    getDecryptedAccount
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
