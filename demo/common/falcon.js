import superfalcon from '../superfalcon-hash-wasm/index.js'
import fs from 'fs'

/**
 * Generates a keypair to use in falcon
 * @returns {Object} Falcon keypair
 */
async function keyGen() {
    return await superfalcon.keyPair()
}

/**
 * Exports the given keypair into 2 JSON files
 * @param {Object} keyPair - The falcon keypair 
 * @param {string} privkeyFile - The JSON file for the private key
 * @param {string} pubkeyFile - The JSON file for the public key
 */
async function writeKeys(keyPair, privkeyFile, pubkeyFile) {
    const keyData = await superfalcon.exportKeys(keyPair)

    delete keyData.public.combined
    delete keyData.private.combined

    keyData.public.type = 'public'
    keyData.private.type = 'private'

    fs.writeFileSync(pubkeyFile, Buffer.from(JSON.stringify(keyData.public)))
    fs.writeFileSync(privkeyFile, Buffer.from(JSON.stringify(keyData.private)))
}

/**
 * Imports falcon key from JSON file
 * @param {string} file - The JSON file to import the key from
 * @returns {Object} The imported key (public or private)
 */
async function readKey(file) {
    const keyData = JSON.parse(fs.readFileSync(file))
    if (keyData.type === 'public') {
        return await superfalcon.importKeys({
            public: {
                classical: keyData.classical,
                postQuantum: keyData.postQuantum
            }
        })
    } else if (keyData.type === 'private') {
        return await superfalcon.importKeys({
            private: {
                classical: keyData.classical,
                postQuantum: keyData.postQuantum
            }
        })
    } else {
        throw Error('Unknown key type')
    }
}

/**
 * Signs a message with falcon
 * WANRING: Pseudo-random function. Two calls with the same parameters result in different signatures (both are valid)
 * @param {Buffer} message - The message as a binary buffer
 * @param {string} hashType - Type of hash to be used for signing. One of: sha512, sha3512
 * @param {Object} privKey - The falcon private key
 * @returns {string} The signature as a base64 string.
 */
async function sign(message, hashType, privKey) {
    const signature = await superfalcon.signDetached(hashType, message, privKey.privateKey)
    return Buffer.from(signature).toString('base64')
}

/**
 * Verifies a given signature with falcon
 * @param {string} signature - The signature as a base64 string
 * @param {Buffer} message - The message as a binary buffer
 * @param {string} hashType - Type of hash to be used for signing. One of: sha512, sha3512
 * @param {Object} pubKey - The falcon public key 
 * @returns {boolean} Whether the signature is valid
 */
async function verify(signature, message, hashType, pubKey) {
    return await superfalcon.verifyDetached(
        hashType,
        Buffer.from(signature, 'base64'),
        message,
        pubKey.publicKey
    )
}

/**
 * Formats falcon public key to store in the STP token
 * @param {Object} pubKey - Falcon public key 
 * @returns {string} The exported key as a base64 string
 */
async function exportKeyToToken(pubKey) {
    const keyData = await superfalcon.exportKeys(pubKey)
    return keyData.public.combined
}

/**
 * Imports a falcon public key from an STP token
 * @param {string} tokenKey - The key from the token (base64 string)
 * @returns {Object} The falcon public key
 */
async function importKeyFromToken(tokenKey) {
    return await superfalcon.importKeys({
        public: {
            combined: tokenKey
        }
    })
}

export default {
    keyGen, writeKeys, readKey, sign, verify, exportKeyToToken, importKeyFromToken
}