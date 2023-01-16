import crypto from 'crypto'

/**
 * Log STP message
 * @param {string} msgName - Name of the message
 * @param {Object} content - The acutal message
 * @param {string} id - The ID used to identify the message
 */
function logMsg(msgName, content, id = '') {
    console.log(`${msgName}: ${id}`)
    console.log(content)
    console.log()
}

/**
 * Deep-copies an object
 * @param {Object} obj - The object to copy 
 * @returns {object} The copied object
 */
function copyObject(obj) {
    return JSON.parse(JSON.stringify(obj))
}

/**
 * Increment the given date by the given period
 * @param {Date} date - The date
 * @param {string} period - The period. One of: monthly, quarterly, annual
 * @returns {Date} The incremented date
 */
function getNextRecurrance(date, period) {
    switch (period) {
        case 'monthly':
            return new Date(date.setMonth(date.getMonth() + 1))
        case 'quarterly':
            return new Date(date.setMonth(date.getMonth() + 3))
        case 'annual':
            return new Date(date.setFullYear(date.getFullYear() + 1))
    }
}

/**
 * Converts key from .pem Buffer to raw string
 * @param {Buffer} key - The key as the content of the .pem file as a Buffer
 * @returns {string} The key as a raw base64 string
 */
function pemKeyToRawKeyStr(key) {
    const fullKeyStr = key.toString()
    const rawKeyStr = fullKeyStr.split('\n').slice(1, -2).join('')
    return rawKeyStr
}

/**
 * Converts key back from raw string to .pem Buffer
 * @param {string} key - The key as a raw base64 string
 * @returns {Buffer} The key as the content of the .pem file as a Buffer
 */
function rawKeyStrToPemPubKey(key) {
    let pemKeyStr = '-----BEGIN PUBLIC KEY-----\n'
    for (let i = 0; i < key.length; i += 64) {
        pemKeyStr += key.substring(i, i + 64) + '\n'
    }
    pemKeyStr += '-----END PUBLIC KEY-----\n'
    return Buffer.from(pemKeyStr)
}

/**
 * Generates random challenge
 * @param {number} bytes - Length of the challenge
 * @returns {string} The challenge with the given length as a base64 string
 */
function genChallenge(bytes) {
    return crypto.randomBytes(bytes).toString('base64')
}

/**
 * Verifies a response to a given challenge
 * @param {string} challenge - The challenge as a base64 string 
 * @param {string} response - The response as a base64 string
 * @param {string} pubkey - The public key to check the response with in raw string
 * @returns {boolean} The result of the verification
 */
function verifyChallResponse(challenge, response, pubkey) {
    return crypto.verify(
        null,
        Buffer.from(challenge, 'base64'),
        rawKeyStrToPemPubKey(pubkey),
        Buffer.from(response, 'base64')
    )
}

/**
 * Signes a given challenge
 * @param {string} challenge - The challenge as a base64 string
 * @param {Buffer} privkey - The private key to sign the challenge in a .pem Buffer
 * @returns {string} The response to the challenge as a base64 string
 */
function signChall(challenge, privkey) {
    return crypto.sign(
        null,
        Buffer.from(challenge, 'base64'),
        privkey
    ).toString('base64')
}

/**
 * Gen the ID from an STP URL (the part after the last `/`)
 * @param {string} url - The STP URL
 * @return {string} The ID
 */
function cutIdFromUrl(url) {
    return url.substring(url.lastIndexOf('/') + 1)
}

export default {
    logMsg, copyObject, getNextRecurrance, pemKeyToRawKeyStr, rawKeyStrToPemPubKey, genChallenge,
    signChall, verifyChallResponse, cutIdFromUrl
}
