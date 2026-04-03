const CryptoJS = require('crypto-js');
const config = require('../config');

function encrypt(plainText) {
  if (!plainText) return null;
  return CryptoJS.AES.encrypt(plainText, config.encryptionKey).toString();
}

function decrypt(cipherText) {
  if (!cipherText) return null;
  const bytes = CryptoJS.AES.decrypt(cipherText, config.encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}

module.exports = { encrypt, decrypt };
