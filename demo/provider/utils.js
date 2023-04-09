import crypto from 'crypto'

import commonUtils from '../common/utils.js'
import utils from '../common/utils.js'


/**
 * Generates the `ProviderHello` message
 * @param {string} url - The URL, where the message will be sent 
 * @param {Buffer} privkey - The private key of the provider as a .pem Buffer
 * @returns {Object} The `ProviderHello` message
 */
function generateProviderHelloMsg(url, privkey) {
    const pin = crypto.randomInt(1000, 10000)
    const t_id = 'STPEXPROV_' + crypto.randomInt(10 ** 9, 10 ** 10)
    const url_token = commonUtils.cutIdFromUrl(url)
    const url_signature = crypto.sign(null, Buffer.from(url_token), privkey).toString('base64')
    return {
        version: 'v1',
        bank_name: 'STP_Example_Provider',
        bic: 'STPEXPROV',
        random: crypto.randomBytes(30).toString('base64'),
        transaction_id: t_id,
        url_signature: url_signature,
        verification_pin: pin
    }
}

/**
 * Sends `ProviderHello` and processes the reponse (`VendorToken` message)
 * @param {string} url - URL to send the message to
 * @param {Object} providerHello - The `ProviderHello` message
 * @returns {[Object?, string?, string?]} `[ VendorToken, null, null ]` if the no errors, `[ null, err_code, err_msg ]` otherwise
 */
async function getVendorTokenMsg(url, providerHello) {
    const vendor_res = await utils.postStpRequest(url, providerHello)
    commonUtils.logMsg('VendorToken', vendor_res)
    if (vendor_res.HTTP_error_code) {
        return [ null, vendor_res.HTTP_error_code, HTTP_error_msg]
    }

    if (!vendor_res.success) {
        return [ null, vendor_res.error_code, vendor_res.error_message ]
    }

    return [ vendor_res, null, null ]
}

/**
 * Verifies the vendor STP token
 * @param {Object} token - The vendor STP token 
 * @returns {boolean} The result of the verification
 */
function verifyVendorToken(token) {
    let tokenCopy = JSON.parse(JSON.stringify(token))
    delete tokenCopy.signatures

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        commonUtils.rawKeyStrToPemPubKey(token.signatures.vendor_key),
        Buffer.from(token.signatures.vendor, 'base64')
    )
}

/**
 * Signes the vendor STP token, creating the full STP token
 * @param {Object} token - The vendor STP token
 * @param {Buffer} privkey - The private key of the provider as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the provider as a .pem Buffer
 * @returns {Object} The full STP token
 */
function signToken(token, privkey, pubkey) {
    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(privkey)

    let signedToken = commonUtils.copyObject(token)
    signedToken.signatures.provider = signature.toString('base64')
    signedToken.signatures.provider_key = commonUtils.pemKeyToRawKeyStr(pubkey)
    return signedToken
}

/**
 * Sends the `ProviderToken` message and processes the response (`VendorAck` message)
 * @param {string} url - The URL to send the message to 
 * @param {Object} providerTokenMsg - The `ProviderToken` message
 * @returns {[Object?, string?, string?]} `[ VendorAck, null, null ]` if the no errors, `[ null, err_code, err_msg ]` otherwise
 */
async function sendProviderTokenMsg(url, providerTokenMsg) {
    const vendor_res = await utils.postStpRequest(url, providerTokenMsg)
    commonUtils.logMsg('VendorAck', vendor_res)
    if (!providerTokenMsg.allowed) {
        return [ null, providerTokenMsg.error_code, providerTokenMsg.error_message ]
    }
    if (vendor_res.HTTP_error_code) {
        return [ null, vendor_res.HTTP_error_code, HTTP_error_msg ]
    }

    if (!vendor_res.success) {
        return [ null, vendor_res.error_code, vendor_res.error_message ]
    }

    return [ vendor_res, null, null ]
}

/**
 * Check whether the refreshed token is valid
 * @param {Object} oldToken - The previous token 
 * @param {Object} newToken - The refreshed token
 * @returns {boolean} `true` if the refreshed token is valid, `false` otherwise
 */
function isRefreshedTokenValid(oldToken, newToken) {
    if (!oldToken.transaction.recurring || !newToken.transaction.recurring) {
        return false;
    }

    let oldTokenCopy = commonUtils.copyObject(oldToken)
    let newTokenCopy = commonUtils.copyObject(newToken)

    delete oldTokenCopy.signatures
    delete oldTokenCopy.transaction.expiry // Skip equality check for now
    delete oldTokenCopy.transaction.recurring.next // Skip equality check for now
    oldTokenCopy.transaction.recurring.index += 1

    delete newTokenCopy.signatures
    delete newTokenCopy.transaction.expiry // Skip equality check for now
    delete newTokenCopy.transaction.recurring.next // Skip equality check for now

    return JSON.stringify(oldTokenCopy) == JSON.stringify(newTokenCopy)
}

/**
 * Make a notification for a given token
 * @param {string} transaction_id - The ID of the transaction token. Format: bic_id
 * @param {string} notify_verb - The notification verb. Now implemented: REVOKE
 * @param {Buffer} privkey - The private key of the provider as a .pem Buffer
 * @param {Buffer} pubkey - The public key of the provider as a .pem Buffer
 * @param {Object} tokens - Dictionary of all saved tokens. Key: `{string}` t_id, value: `{Object}` token
 * @param {Object} tokenNotifyUrls - Dictionary of all saved token notification URLs. Key: `{string}` t_id, value: `{string}` url
 * @param {Object?} modificationData - The modification data
 * @param {boolean} modificationData.accept - Whether the modification was accepted 
 * @param {Object} modificationData.token - The modified JWT token signed by the vendor
 * @returns {[string?, string?]} The result of the notification. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function notify(transaction_id, notify_verb, privkey, pubkey, tokens, tokenNotifyUrls, modificationData = null) {
    const challenge = commonUtils.genChallenge(30)
    const vendorVerifChall = await utils.postStpRequest(tokenNotifyUrls[transaction_id], {
        transaction_id: transaction_id,
        challenge: challenge
    })
    commonUtils.logMsg('VendorVerifChall', vendorVerifChall)
    if (vendorVerifChall.HTTP_error_code) {
        return [ vendorVerifChall.HTTP_error_code, vendorVerifChall.HTTP_error_msg ]
    }

    if (!vendorVerifChall.success) {
        return [ vendorVerifChall.error_code, vendorVerifChall.error_message ]
    }

    let providerVerifNotify = {}
    if (!commonUtils.verifyChallResponse(challenge, vendorVerifChall.response, tokens[transaction_id].signatures.vendor_key)) {
        providerVerifNotify = {
            success: false,
            error_code: 'AUTH_FAILED',
            error_message: 'The vendor\'s response to the challenge was not appropriate',
        }
    } else {
        providerVerifNotify = {
            success: true,
            response: commonUtils.signChall(vendorVerifChall.challenge, privkey),
            notify_verb: notify_verb
        }
        if (notify_verb == 'FINISH_MODIFICATION') {
            if (modificationData.accept) {
                providerVerifNotify.modification_status = 'ACCEPTED'
                const modifiedFullToken = signToken(modificationData.token, privkey, pubkey)
                providerVerifNotify.token = utils.objectToBase64(modifiedFullToken)
            } else {
                providerVerifNotify.modification_status = 'REJECTED'
            }
        }
    }
    const vendorAck = await utils.postStpRequest(vendorVerifChall.next_url, providerVerifNotify)
    commonUtils.logMsg('VendorAck', vendorAck)
    if (vendorAck.HTTP_error_code) {
        return [ vendorAck.HTTP_error_code, vendorAck.HTTP_error_msg ]
    }
    
    if (!providerVerifNotify.success) {
        return [ providerVerifNotify.error_code, providerVerifNotify.error_message ]
    }
    if (!vendorAck.success) {
        return [ vendorAck.error_code, vendorAck.error_message ]
    }
    
    if (notify_verb == 'REVOKE') { 
        delete tokens[transaction_id]
        delete tokenNotifyUrls[transaction_id]
    }
    return [ null, null ]
}


export default {
    generateProviderHelloMsg, getVendorTokenMsg, verifyVendorToken, signToken, sendProviderTokenMsg, isRefreshedTokenValid, notify
}
