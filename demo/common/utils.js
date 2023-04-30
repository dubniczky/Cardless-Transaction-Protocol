import crypto from 'crypto'
import falcon from './falcon.js'

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
 * @param {number|string} dateData - Data to cosntruct Date with. Can me unix timestamp or datestring
 * @param {string} period - The period. One of: monthly, quarterly, annual
 * @returns {string} The incremented date as ISO string
 */
function getNextRecurrance(dateData, period) {
    const date = new Date(dateData)
    switch (period) {
        case 'monthly':
            return new Date(date.setMonth(date.getMonth() + 1)).toISOString()
        case 'quarterly':
            return new Date(date.setMonth(date.getMonth() + 3)).toISOString()
        case 'annual':
            return new Date(date.setFullYear(date.getFullYear() + 1)).toISOString()
    }
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
async function verifyChallResponse(challenge, response, pubkey) {
    return await falcon.verify(response, Buffer.from(challenge, 'base64'), pubkey)
}

/**
 * Signes a given challenge
 * @param {string} challenge - The challenge as a base64 string
 * @param {Buffer} privkey - The private key to sign the challenge in a .pem Buffer
 * @returns {string} The response to the challenge as a base64 string
 */
async function signChall(challenge, privkey) {
    return await falcon.sign(Buffer.from(challenge, 'base64'), privkey)
}

/**
 * Get the ID from an STP URL (the part after the last `/`)
 * @param {string} url - The STP URL
 * @return {string} The ID
 */
function cutIdFromUrl(url) {
    return url.substring(url.lastIndexOf('/') + 1)
}

/**
 * Sleep the given number of milliseconds
 * @param {number} ms - amount of milliseconds to sleep
 */
async function sleep(ms) {
    await new Promise(r => setTimeout(r, ms))
}

/**
 * Format object to well indented string
 * @param {Object} obj - the object to format
 * @returns {string} The formated object
 */
function formatJSON(obj) {
    return JSON.stringify(obj, null, 4)
}

/**
 * Converts base64 string to JS object
 * @param {string} base64 - The stringified JSON encoded in base64 
 * @returns {Object} The JS object
 */
function base64ToObject(base64) {
    return JSON.parse(Buffer.from(base64, 'base64'))
}

/**
 * Converts JS object to base64 string
 * @param {Object} obj - The stringified JSON encoded in base64 
 * @returns {string} The base64 string
 */
function objectToBase64(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64')
}

/**
 * Send stp request to a given url
 * @param {string} stpUrl - The STP URL (starting with stp://)
 * @param {Object} message - The JS object to send 
 * @returns {Object} The resulting JS object. If HTTP error occures, then the result has 2 fields: `HTTP_error_code`, `HTTP_error_msg`
 */
async function postStpRequest(stpUrl, message) {
    const res = await fetch(stpUrl.replace('stp://', 'http://'), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
    })
    if (res.status != 200) {
        return {
            HTTP_error_code: res.status,
            HTTP_error_msg: await res.text()
        }
    }
    return await res.json()
}

/**
 * Verifies the provider signature of a full STP token
 * @param {Object} token - The full STP token
 * @returns {boolean} The result of the verification
 */
async function verifyProviderSignatureOfToken(token) {
    let tokenCopy = copyObject(token)
    delete tokenCopy.signatures.provider
    delete tokenCopy.signatures.provider_key

    return await falcon.verify(
        token.signatures.provider,
        Buffer.from(JSON.stringify(tokenCopy)),
        await falcon.importKeyFromToken(token.signatures.provider_key)
    )
}

/**
 * Verifies the vendor STP token
 * @param {Object} token - The vendor STP token 
 * @returns {boolean} The result of the verification
 */
async function verifyVendorSignatureOfToken(token) {
    let tokenCopy = copyObject(token)
    delete tokenCopy.signatures

    return await falcon.verify(
        token.signatures.vendor,
        Buffer.from(JSON.stringify(tokenCopy)),
        await falcon.importKeyFromToken(token.signatures.vendor_key)
    )
}

/**
 * Sets propper parameters to the repsonse based on validity
 * @param {Response} res - The response 
 * @param {boolean} isValid - Whether the input is valid or not 
 * @param {string?} err_code - Error code of the response. Should be given together with `err_msg`
 * @param {string?} err_msg - Error message of the response. Should be given together with `err_code`
 * @param {string} statusVerb - Status verb which is set to false id validation fails
 * @returns {booleans} Same as `isValid`
 */
function validateRes(res, isValid, err_code = null, err_msg = null, statusVerb = 'success') {
    if (!isValid) {
        if (err_code && err_msg) {
            const response = {
                error_code: err_code,
                error_message: err_msg
            }
            response[statusVerb] = false;
            res.send(response)
        } else {
            res.sendStatus(400)
        }
        return false
    }
    return true
}

/**
 * Helper function to check whether the request's body contains the appropriate fields
 * @param {Request} req - The request
 * @param {Reponse} res - The response
 * @param {string[]} fields - The list of fieldnames as string 
 * @returns {boolean} `true` if the request contained all fields, otherwise `false`
 */
function doesBodyContainFields(req, res, fields) {
    return validateRes(res, fields.every((field) => field in req.body))
}

/**
 * Generates the key and the IV used in token encryption/decryption from the original token
 * @param {Object} originalToken - The original full STP token 
 * @returns {[Buffer, Buffer]} [ key, iv ]
 */
function getKeyAndIV(originalToken) {
    const originalTokenCopy = copyObject(originalToken)
    originalTokenCopy.metadata.purpose = 'ENCRYPT'
    const hash = crypto.createHash('sha512')
        .update(Buffer.from(JSON.stringify(originalTokenCopy)))
        .digest()
    const key = hash.slice(0, 32)
    const iv = hash.slice(32, 48)
    return [ key, iv ]
}

/**
 * Encrypts the new token with the original token
 * @param {Object} originalToken - The original token
 * @param {Object} tokenToEncrypt - The new token to encrypt
 * @returns {string} The ecrypted new token as base64 string
 */
function encryptToken(originalToken, tokenToEncrypt) {
    const [ key, iv ] = getKeyAndIV(originalToken)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const cipherText = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(tokenToEncrypt))),
        cipher.final()
    ])
    return cipherText.toString('base64')
}

/**
 * Decrpyts the encrypted new token with the original token
 * @param {Object} originalToken - The original token
 * @param {string} tokenToDecrypt - The new token encrypted as a base64 string
 * @returns {Object} The new token decrypted
 */
function decryptToken(originalToken, tokenToDecrypt) {
    const [ key, iv ] = getKeyAndIV(originalToken)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    const plainText = Buffer.concat([
        decipher.update(Buffer.from(tokenToDecrypt, 'base64')),
        decipher.final()
    ])
    return JSON.parse(plainText.toString())
}

export default {
    logMsg, copyObject, getNextRecurrance, genChallenge, signChall, verifyChallResponse, cutIdFromUrl,
    sleep, formatJSON, base64ToObject, objectToBase64, postStpRequest, verifyProviderSignatureOfToken,
    verifyVendorSignatureOfToken, validateRes, doesBodyContainFields, encryptToken, decryptToken
}
