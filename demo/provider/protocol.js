import crypto from 'crypto'

import utils from '../common/utils.js'
import falcon from '../common/falcon.js'
import { protocolState, keys } from './protocolState.js'
import validator from './validator.js'

/**
 * Generates the `ProviderHello` message
 * @param {string} url - The URL, where the message will be sent
 * @returns {Object} The `ProviderHello` message
 */
async function generateProviderHelloMsg(url) {
    const pin = crypto.randomInt(1000, 10000)
    const t_id = crypto.randomUUID()
    const url_token = utils.cutIdFromUrl(url)
    const url_signature = await falcon.sign(Buffer.from(url_token), 'sha512', keys.private)
    const dummy_encrypted_customer = crypto.randomBytes(30).toString('base64') // random dummy data, would encrypt some customer id in real use case
    return {
        version: 'v1',
        bank_name: 'STP_Example_Provider',
        bic: 'STPEXPROV',
        random: crypto.randomBytes(30).toString('base64'),
        transaction_id: t_id,
        customer: dummy_encrypted_customer,
        url_signature: url_signature,
        verification_pin: pin
    }
}

/**
 * Sends `ProviderHello` and processes the reponse (`VendorOffer` message)
 * @param {string} url - URL to send the message to
 * @returns {[Object?, string?, string?]} `[ VendorOffer, null, null ]` if the no errors, `[ null, err_code, err_msg ]` otherwise
 */
async function sendProviderHello(url) {
    const providerHello = await generateProviderHelloMsg(url)
    const vendorOffer = await utils.postStpRequest(url, providerHello)
    utils.logMsg('VendorOffer', vendorOffer)
    if (vendorOffer.HTTP_error_code) {
        return [ null, vendorOffer.HTTP_error_code, vendorOffer.HTTP_error_msg]
    }

    if (!vendorOffer.success) {
        return [ null, vendorOffer.error_code, vendorOffer.error_message ]
    }

    protocolState.ongoing.transactions[providerHello.transaction_id] = {
        token: vendorOffer.token,
        response_url: vendorOffer.response_url,
        pin: providerHello.verification_pin
    }
    return [ vendorOffer, null, null ]
}


/**
 * Signes the vendor STP token, creating the full STP token
 * @param {Object} token - The vendor STP token
 * @returns {Object} The full STP token
 */
async function signToken(token) {
    const tokenToSign = utils.copyObject(token)
    tokenToSign.signatures.signed_at = new Date(Date.now()).toISOString()
    const hashType = tokenToSign.metadata.alg.split(',')[1]
    const signature = await falcon.sign(Buffer.from(JSON.stringify(tokenToSign)), hashType, keys.private)

    tokenToSign.signatures.provider = signature
    tokenToSign.signatures.provider_key = await falcon.exportKeyToToken(keys.public)
    return tokenToSign
}

/**
 * Sends the `ProviderConfirm` message and processes the response (`VendorAck` message)
 * @param {string} url - The URL to send the message to
 * @param {Object} vendorToken - The vendor STP token
 * @param {number} port - The port of the provider server 
 * @returns {[string?, string?]} `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function handleUserInput(url, vendorToken, port) {
    const token = await signToken(vendorToken)
    const providerConfirm = {
        allowed: true,
        token: token,
        remediation_url: `stp://localhost:${port}/api/stp/remediation/${crypto.randomUUID()}`
    }

    const vendorAck = await utils.postStpRequest(url, providerConfirm)
    utils.logMsg('VendorAck', vendorAck)
    if (!providerConfirm.allowed) {
        return [ providerConfirm.error_code, providerConfirm.error_message ]
    }
    if (vendorAck.HTTP_error_code) {
        return [ vendorAck.HTTP_error_code, vendorAck.HTTP_error_msg ]
    }
    if (!vendorAck.success) {
        return [ vendorAck.error_code, vendorAck.error_message ]
    }

    protocolState.tokens[token.transaction.id] = token
    protocolState.tokenRevisionUrls[token.transaction.id] = vendorAck.revision_url
    protocolState.tokenSignatureHashes[token.transaction.id] = utils.hashProviderSignature(token)
    protocolState.tokenVendorKeys[token.transaction.id] = token.signatures.vendor_key
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
        return false
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
* Check whether the modified token is valid
* @param {Object} oldToken - The previous token 
* @param {Object} newToken - The modified token
* @param {number} modifiedAmount - The modified amount
* @returns {boolean} `true` if the modified token is valid, `false` otherwise
*/
function isModifiedTokenValid(oldToken, newToken, modifiedAmount) {
   let oldTokenCopy = utils.copyObject(oldToken)
   let newTokenCopy = utils.copyObject(newToken)

   delete oldTokenCopy.signatures
   oldTokenCopy.transaction.amount = modifiedAmount

   delete newTokenCopy.signatures

   return JSON.stringify(oldTokenCopy) == JSON.stringify(newTokenCopy)
}

/**
 * Handles successful revoke token remediation
 * @param {Request} req - The `VendorRemediate` request
 * @param {Response} res - The `ProviderResponse` response
 */
async function handleRevokeRemediation(req, res) {
    delete protocolState.tokens[req.body.transaction_id]
    delete protocolState.tokenRevisionUrls[req.body.transaction_id]
    delete protocolState.tokenSignatureHashes[req.body.transaction_id]
    delete protocolState.tokenVendorKeys[req.body.transaction_id]
    res.send({
        success: true,
        response: await utils.signChall(req.body.challenge, 'sha512', keys.private)
    })
}

/**
 * Handles successful refresh token remediation
 * @param {Request} req - The `VendorRemediate` request
 * @param {Response} res - The `ProviderResponse` response
 */
async function handleRefreshRemediation(req, res) {
    const tokenSignatureHash = protocolState.tokenSignatureHashes[req.body.transaction_id]
    const original_token = utils.decryptToken(tokenSignatureHash, req.body.original_token)
    const refreshed_token = utils.decryptToken(tokenSignatureHash, req.body.refreshed_token)
    if (!utils.validateRes(res, isRefreshedTokenValid(original_token, refreshed_token),
            'INCORRECT_TOKEN', 'The refreshed token contains incorrect data') ||
        !utils.validateRes(res, await utils.verifyVendorSignatureOfToken(original_token),
            'INCORRECT_TOKEN_SIGN', 'The original token is not signed properly') ||
        !utils.validateRes(res, await utils.verifyProviderSignatureOfToken(original_token),
            'INCORRECT_TOKEN_SIGN', 'The original token is not signed properly') ||
        !utils.validateRes(res, await utils.verifyVendorSignatureOfToken(refreshed_token),
            'INCORRECT_TOKEN_SIGN', 'The refreshed token is not signed properly')) {
        return
    }

    const fullToken = await signToken(refreshed_token)
    protocolState.tokens[req.body.transaction_id] = fullToken
    protocolState.tokenSignatureHashes[req.body.transaction_id] = utils.hashProviderSignature(fullToken)
    res.send({
        success: true,
        response: await utils.signChall(req.body.challenge, 'sha512', keys.private),
        token: fullToken
    })
}

/**
 * Handles successful modification token remediation
 * @param {Request} req - The `VendorRemediate` request
 * @param {Response} res - The `ProviderResponse` response
 * @param {boolean} instantlyAcceptModify - Whether the provider should instantly accept the modification or should promt the user
 */
async function handleModificationRemediation(req, res, instantlyAcceptModify) {
    const tokenSignatureHash = protocolState.tokenSignatureHashes[req.body.transaction_id]
    const original_token = utils.decryptToken(tokenSignatureHash, req.body.original_token)
    const modified_token = utils.decryptToken(tokenSignatureHash, req.body.modified_token)
    if (!utils.validateRes(res, isModifiedTokenValid(original_token, modified_token, req.body.modified_amount),
            'INCORRECT_TOKEN', 'The modified token contains incorrect data') ||
        !utils.validateRes(res, await utils.verifyVendorSignatureOfToken(original_token),
            'INCORRECT_TOKEN_SIGN', 'The original token is not signed properly') ||
        !utils.validateRes(res, await utils.verifyProviderSignatureOfToken(original_token),
            'INCORRECT_TOKEN_SIGN', 'The original token is not signed properly') ||
        !utils.validateRes(res, await utils.verifyVendorSignatureOfToken(modified_token),
            'INCORRECT_TOKEN_SIGN', 'The modified token is not signed properly')) {
        return
    }

    const providerResponse = {
        success: true,
        response: await utils.signChall(req.body.challenge, 'sha512', keys.private)
    }
    
    if (instantlyAcceptModify) {
        const fullToken = await signToken(modified_token)
        protocolState.tokens[req.body.transaction_id] = fullToken
        protocolState.tokenSignatureHashes[req.body.transaction_id] = utils.hashProviderSignature(fullToken)

        providerResponse.modification_status = 'ACCEPTED'
        providerResponse.token = fullToken
    } else {
        protocolState.ongoing.modifications.push({
            id: req.body.transaction_id,
            modification: {
                amount: req.body.modified_amount
            },
            token: modified_token,
        })
        
        providerResponse.modification_status = 'PENDING'
    }

    res.send(providerResponse)
}

/**
 * Handles unknown remediation verb
 * @param {Response} res - The `ProviderResponse` response
 */
function handleUnknownRemediationVerb(res) {
    res.send({
        success: false,
        error_code: 'UNKNOWN_REMEDIATION_VERB',
        error_message: 'Unsupported remediation_verb'
    })
}

/**
 * Generates `ProviderRevise` message
 * @param {string} transaction_id - The transaction ID related to the revision
 * @param {string} revision_verb - The revision verb. Now implemented: REVOKE, FINISH_MODIFICATION
 * @param {Object?} modificationData - The modification data
 * @param {boolean} modificationData.accept - Whether the modification was accepted 
 * @param {Object} modificationData.token - The modified JWT token signed by the vendor
 * @returns {Object} The `ProviderRevise` message
 */
async function generateProviderRevise(transaction_id, revision_verb, modificationData) {
    const challenge = utils.genChallenge(30)
    const revisionUrl = protocolState.tokenRevisionUrls[transaction_id]
    const urlToken = utils.cutIdFromUrl(revisionUrl)
    const providerRevise = {
        transaction_id: transaction_id,
        challenge: challenge,
        url_signature: await falcon.sign(Buffer.from(urlToken), 'sha-512', keys.private),
        revision_verb: revision_verb
    }
    
    switch (revision_verb) {
        case 'FINISH_MODIFICATION':
            if (modificationData.accept) {
                providerRevise.modification_status = 'ACCEPTED'
                const modifiedFullToken = await signToken(modificationData.token)
                providerRevise.token = utils.encryptToken(protocolState.tokenSignatureHashes[transaction_id], modifiedFullToken)
            } else {
                providerRevise.modification_status = 'REJECTED'
            }
            break
    }

    return providerRevise
}

/**
 * Make a token revision for a given token
 * @param {string} transaction_id - The ID of the transaction token. Format: bic_id
 * @param {string} revision_verb - The revision verb. Now implemented: REVOKE, FINISH_MODIFICATION
 * @param {Object?} modificationData - The modification data
 * @param {boolean} modificationData.accept - Whether the modification was accepted 
 * @param {Object} modificationData.token - The modified JWT token signed by the vendor
 * @returns {[string?, string?]} The result of the revision. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function reviseToken(transaction_id, revision_verb, modificationData = null) {
    const providerRevise = await generateProviderRevise(transaction_id, revision_verb, modificationData)
    const revisionUrl = protocolState.tokenRevisionUrls[transaction_id]
    const vendorResponse = await utils.postStpRequest(revisionUrl, providerRevise)

    utils.logMsg('VendorResponse', vendorResponse)
    let result = await validator.checkVendorResponse(transaction_id, providerRevise.challenge, vendorResponse)
    if (result) {
        return result
    }
    
    switch (revision_verb) {
        case 'REVOKE':
            delete protocolState.tokens[transaction_id]
            delete protocolState.tokenRevisionUrls[transaction_id]
            delete protocolState.tokenSignatureHashes[transaction_id]
            delete protocolState.tokenVendorKeys[transaction_id]
            break
        case 'FINISH_MODIFICATION':
            if (modificationData.accept) {
                protocolState.tokens[transaction_id] = utils.decryptToken(protocolState.tokenSignatureHashes[transaction_id], providerRevise.token)
                protocolState.tokenSignatureHashes[transaction_id] = utils.hashProviderSignature(protocolState.tokens[transaction_id])
            }
            break
    }

    return [ null, null ]
}


export default {
    sendProviderHello, handleUserInput, handleRevokeRemediation, handleRefreshRemediation, handleModificationRemediation,
    handleUnknownRemediationVerb, reviseToken
}
