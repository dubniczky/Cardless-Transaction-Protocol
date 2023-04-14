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
function verifyProviderSignatureOfToken(token) {
    let tokenCopy = copyObject(token)
    delete tokenCopy.signatures.provider
    delete tokenCopy.signatures.provider_key

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        rawKeyStrToPemPubKey(token.signatures.provider_key),
        Buffer.from(token.signatures.provider, 'base64')
    )
}

/**
 * Verifies the vendor STP token
 * @param {Object} token - The vendor STP token 
 * @returns {boolean} The result of the verification
 */
function verifyVendorSignatureOfToken(token) {
    let tokenCopy = copyObject(token)
    delete tokenCopy.signatures

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        rawKeyStrToPemPubKey(token.signatures.vendor_key),
        Buffer.from(token.signatures.vendor, 'base64')
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

export default {
    logMsg, copyObject, getNextRecurrance, pemKeyToRawKeyStr, rawKeyStrToPemPubKey, genChallenge,
    signChall, verifyChallResponse, cutIdFromUrl, sleep, formatJSON, base64ToObject, objectToBase64,
    postStpRequest, verifyProviderSignatureOfToken, verifyVendorSignatureOfToken, validateRes,
    doesBodyContainFields
}
