import crypto from 'crypto'

import utils from '../common/utils.js'
import { getProtocolState, getKeys } from './protocolState.js'

/**
 * Generates the `ProviderHello` message
 * @param {string} url - The URL, where the message will be sent
 * @returns {Object} The `ProviderHello` message
 */
function generateProviderHelloMsg(url) {
    const pin = crypto.randomInt(1000, 10000)
    const t_id = 'STPEXPROV_' + crypto.randomInt(10 ** 9, 10 ** 10)
    const url_token = utils.cutIdFromUrl(url)
    const url_signature = crypto.sign(null, Buffer.from(url_token), getKeys().private).toString('base64')
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
 * @returns {[Object?, string?, string?]} `[ VendorToken, null, null ]` if the no errors, `[ null, err_code, err_msg ]` otherwise
 */
async function sendProviderHello(url) {
    const providerHello = generateProviderHelloMsg(url)
    const vendorToken = await utils.postStpRequest(url, providerHello)
    utils.logMsg('VendorToken', vendorToken)
    if (vendorToken.HTTP_error_code) {
        return [ null, vendorToken.HTTP_error_code, vendorToken.HTTP_error_msg]
    }

    if (!vendorToken.success) {
        return [ null, vendorToken.error_code, vendorToken.error_message ]
    }

    getProtocolState().ongoing.transactions[providerHello.transaction_id] = {
        token: vendorToken.token,
        response_url: vendorToken.response_url,
        pin: providerHello.verification_pin
    }
    return [ vendor_res, null, null ]
}


/**
 * Signes the vendor STP token, creating the full STP token
 * @param {Object} token - The vendor STP token
 * @returns {Object} The full STP token
 */
function signToken(token) {
    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(getKeys().private)

    let signedToken = utils.copyObject(token)
    signedToken.signatures.provider = signature.toString('base64')
    signedToken.signatures.provider_key = utils.pemKeyToRawKeyStr(getKeys().public)
    return signedToken
}

/**
 * Sends the `ProviderToken` message and processes the response (`VendorAck` message)
 * @param {string} url - The URL to send the message to
 * @param {Object} vendorToken - The vendor STP token
 * @param {number} port - The port of the provider server 
 * @returns {[string?, string?]} `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function handleUserInput(url, vendorToken, port) {
    const token = providerUtils.signToken(vendorToken)
    const providerTokenMsg = {
        allowed: true,
        token: utils.base64ToObject(token),
        change_url: `stp://localhost:${port}/api/stp/change`
    }

    const vendorAck = await utils.postStpRequest(url, providerTokenMsg)
    utils.logMsg('VendorAck', vendorAck)
    if (!providerTokenMsg.allowed) {
        return [ providerTokenMsg.error_code, providerTokenMsg.error_message ]
    }
    if (vendorAck.HTTP_error_code) {
        return [ vendorAck.HTTP_error_code, vendorAck.HTTP_error_msg ]
    }
    if (!vendorAck.success) {
        return [ vendorAck.error_code, vendorAck.error_message ]
    }

    getProtocolState().tokens[token.transaction.id] = token
    getProtocolState().tokenNotifyUrls[token.transaction.id] = vendorAck.notify_url
    return [ null, null ]
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

    let oldTokenCopy = utils.copyObject(oldToken)
    let newTokenCopy = utils.copyObject(newToken)

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
 * @param {Object} tokens - Dictionary of all saved tokens. Key: `{string}` t_id, value: `{Object}` token
 * @param {Object} tokenNotifyUrls - Dictionary of all saved token notification URLs. Key: `{string}` t_id, value: `{string}` url
 * @param {Object?} modificationData - The modification data
 * @param {boolean} modificationData.accept - Whether the modification was accepted 
 * @param {Object} modificationData.token - The modified JWT token signed by the vendor
 * @returns {[string?, string?]} The result of the notification. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function notify(transaction_id, notify_verb, tokens, tokenNotifyUrls, modificationData = null) {
    const challenge = utils.genChallenge(30)
    const vendorVerifChall = await utils.postStpRequest(tokenNotifyUrls[transaction_id], {
        transaction_id: transaction_id,
        challenge: challenge
    })
    utils.logMsg('VendorVerifChall', vendorVerifChall)
    if (vendorVerifChall.HTTP_error_code) {
        return [ vendorVerifChall.HTTP_error_code, vendorVerifChall.HTTP_error_msg ]
    }

    if (!vendorVerifChall.success) {
        return [ vendorVerifChall.error_code, vendorVerifChall.error_message ]
    }

    let providerVerifNotify = {}
    if (!utils.verifyChallResponse(challenge, vendorVerifChall.response, tokens[transaction_id].signatures.vendor_key)) {
        providerVerifNotify = {
            success: false,
            error_code: 'AUTH_FAILED',
            error_message: 'The vendor\'s response to the challenge was not appropriate',
        }
    } else {
        providerVerifNotify = {
            success: true,
            response: utils.signChall(vendorVerifChall.challenge, getKeys().private),
            notify_verb: notify_verb
        }
        if (notify_verb == 'FINISH_MODIFICATION') {
            if (modificationData.accept) {
                providerVerifNotify.modification_status = 'ACCEPTED'
                const modifiedFullToken = signToken(modificationData.token)
                providerVerifNotify.token = utils.objectToBase64(modifiedFullToken)
            } else {
                providerVerifNotify.modification_status = 'REJECTED'
            }
        }
    }
    const vendorAck = await utils.postStpRequest(vendorVerifChall.next_url, providerVerifNotify)
    utils.logMsg('VendorAck', vendorAck)
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
    sendProviderHello, handleUserInput, isRefreshedTokenValid, notify
}
