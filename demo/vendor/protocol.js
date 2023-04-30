import crypto from 'crypto'

import utils from '../common/utils.js'
import validator from './validator.js'
import { protocolState, keys, popOngoingRequest, popOngoingRequestPin, getToken } from './protocolState.js'

/**
 * Convert recurring option to period (one_time -> null)
 * @param {string} recurringOption - The recurring options
 * @returns {string} The recurring period
 */
function recurringOptionToPeriod(recurringOption) {
    if (recurringOption === 'one_time') {
        return null
    }
    return recurringOption
}

/**
 * Convert recurring period to option (null -> one_time)
 * @param {string} recurringPeriod - The recurring period
 * @returns {string} The recurring option
 */
function recurringPeriodToOption(recurringPeriod) {
    if (recurringPeriod) {
        return recurringPeriod
    }
    return 'one_time'
}

/**
 * Generate STP URL from request
 * @param {Request} req - The form POST request. Contains fields: `amount`, `currency`, `recurring`
 * @returns {string} The UUID of the generated URL
 */
function generateNewTransactionUrl(req) {
    const uuid = crypto.randomUUID()
    protocolState.ongoing.requests[uuid] = {
        amount: req.body.amount,
        currency: req.body.currency,
        period: recurringOptionToPeriod(req.body.recurring)
    }
    console.log(`Transaction data:\n${uuid}: ${JSON.stringify(protocolState.ongoing.requests[uuid])}\n`)
    return uuid
}

/**
 * Cosntruct and send the `VendorToken` message
 * @param {Request} req - The incomming request
 * @param {Response} res - The response to send the message to
 * @param {string} uuid - The UUID of the incomming STP URL
 * @param {number} port - The port of the vendor server 
 */
function sendVendorTokenMsg(req, res, uuid, port) {
    protocolState.ongoing.requestPins[uuid] = req.body.verification_pin
    const currReq = popOngoingRequest(uuid)
    const transId = crypto.randomUUID()
    protocolState.ongoing.responses[transId] = true

    const token = generateVendorToken(req.body, currReq)
    const respMessage = generateVendorTokenMsg(transId, port, token, currReq)
    res.send(respMessage)
}

/**
 * Returns the PIN associated with given UUID
 * @param {Response} res - The response to send the PIN to
 * @param {string} uuid - The UUID of the request, from where the PIN is needed 
 * @returns {string} The PIN as a string
 */
async function waitAndSendRequestPin(res, uuid) {
    if (!(uuid in protocolState.ongoing.requests || uuid in protocolState.ongoing.requestPins)) {
        res.sendStatus(400)
        return
    }

    while (!(uuid in protocolState.ongoing.requestPins)) {
        await utils.sleep(100)
    }

    const pin = popOngoingRequestPin(uuid)
    res.send(pin.toString())
}

/**
 * Handles `ProviderToken` message and sends the `VendorAck` message
 * @param {Request} req - The `ProviderToken` request
 * @param {Response} res - The `VendorAck` response
 * @param {string} uuid - The UUID of the response
 * @param {number} port - The port of the vendor server 
 */
function sendVendorAck(req, res, uuid, port) {
    delete protocolState.ongoing.responses[uuid]
    const token = utils.base64ToObject(req.body.token)
    protocolState.tokens[token.transaction.id] = token
    protocolState.tokenChangeUrls[token.transaction.id] = req.body.remediation_url
    console.log('Transaction token:', token)
    res.send({
        success: true,
        revision_url: `stp://localhost:${port}/api/stp/revision/${crypto.randomUUID()}`
    })
}

/**
 * Handles successful revoke notification
 * @param {Response} res - The `VendorAck` response 
 * @param {string} id - The transaction ID related to the notification
 */
function handleRevokeRevision(req, res) {
    delete protocolState.tokens[req.body.transaction_id]
    delete protocolState.tokenChangeUrls[req.body.transaction_id]
    res.send({
        success: true,
        response: utils.signChall(req.body.challenge, keys.private)
    })
}

/**
 * Handles successful finished modification notification
 * @param {Request} req - The `ProviderVerifNotify` request
 * @param {Response} res - The `VendorAck` response
 * @param {string} id - The transaction ID related to the notification
 */
function handleFinishModifyRevision(req, res) {
    if (req.body.modification_status == 'ACCEPTED') {
        protocolState.tokens[req.body.transaction_id] = utils.base64ToObject(req.body.token)
    }
    res.send({
        success: true,
        response: utils.signChall(req.body.challenge, keys.private)
    })
}

/**
 * Handles unknown notification verb
 * @param {Response} res - The `VendorAck` response
 */
function handleUnknownRevision(res) {
    res.send({
        success: false,
        error_code: 'UNKNOWN_NOTIFY_VERB',
        error_message: 'Unsupported notify_verb'
    })
}

/**
 * Constructs and signs the vendor STP token from the transaction data
 * @param {Object} transaction - The transaction data in an object
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
function constructAndSignToken(transaction) {
    let token = {
        metadata: {
            version: 1,
            alg: 'sha512',
            enc: 'b64',
            sig: 'rsa2048'
        },
        transaction: transaction
    }

    let signer = crypto.createSign('SHA512')
    signer.update(Buffer.from(JSON.stringify(token)))
    const signature = signer.sign(keys.private)
    token.signatures = {
        vendor: signature.toString('base64'),
        vendor_key: utils.pemKeyToRawKeyStr(keys.public)
    }

    return token
}

/**
 * Generates a new vendor STP token
 * @param {Object} reqBody - The content of the incomming `ProviderHello` message 
 * @param {string} reqBody.transaction_id - The ID of the transaction defined by the provider. Format: bic_id
 * @param {string} reqBody.bic - The Bank Identification Code (BIC) of the provider
 * @param {Object} transactionData - The transaction data
 * @param {number} transactionData.amount - The amount of the transaction 
 * @param {string} transactionData.currency - The currency code of the transaction
 * @param {string?} transactionData.period - The recurrance period of the transaction. One of: null, monthly, quarterly, annual
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
function generateVendorToken(reqBody, transactionData) {
    let transaction = {
        id: reqBody.transaction_id,
        expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        provider: reqBody.bic,
        amount: transactionData.amount,
        currency: transactionData.currency
    }

    if (transactionData.period) {
        transaction.recurring = {
            period: transactionData.period,
            next: utils.getNextRecurrance(Date.now(), transactionData.period),
            index: 0
        }
    } else {
        transaction.recurring = null
    }

    return constructAndSignToken(transaction)
}

/**
 * Generates a refreshed version of the given token
 * @param {Object} token - The original token
 * @returns {Object} The refreshed token
 */
function generateRefreshedToken(token) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.expiry = 
        utils.getNextRecurrance(transaction.expiry, transaction.recurring.period)
    transaction.recurring.next = 
        utils.getNextRecurrance(transaction.recurring.next, transaction.recurring.period)
    transaction.recurring.index += 1
    
    return constructAndSignToken(transaction) 
}

/**
 * Generates the modified token
 * @param {Object} token - The original token 
 * @param {Object} modificationData - The modification data
 * @param {number} modificationData.amount - The amount of the modification 
 * @param {string} modificationData.currency - The currency code of the modification
 * @param {string?} modificationData.period - The recurrance period of the modification. One of: null, monthly, quarterly, annual
 * @returns {Object} The modified token
 */
function generateModifiedToken(token, modified_amount) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.amount = modified_amount
    return constructAndSignToken(transaction)
}

/**
 * Generates the `VendorToken` message
 * @param {string} transId - The ID of the 2nd round trip of the transaction
 * @param {number} port - The port of the vendor server
 * @param {Object} token - The vendor STP token 
 * @param {Object} transactionData - The transaction data
 * @param {number} transactionData.amount - The amount of the transaction 
 * @param {string} transactionData.currency - The currency code of the transaction
 * @param {string?} transactionData.period - The recurrance period of the transaction. One of: null, monthly, quarterly, annual
 * @returns {Object} The `VendroToken` message
 */
function generateVendorTokenMsg(transId, port, token, transactionData) {
    return {
        success: true,
        transaction_id: transId,
        response_url: `stp://localhost:${port}/api/stp/response/${transId}`,
        vendor: {
            name: 'STP Example Vendor',
            logo_url: 'https://i.insider.com/602ee9ced3ad27001837f2ac?width=700',
            address: 'Washington, Imaginary st. 123'
        },
        transaction: {
            amount: transactionData.amount,
            currency_code: transactionData.currency,
            recurrance: transactionData.period
        },
        token: utils.objectToBase64(token)
    }
}


function generateVendorRemediate(transaction_id, remediation_verb, modified_amount) {
    const challenge = utils.genChallenge(30)
    const remediationUrl = protocolState.tokenChangeUrls[transaction_id]
    const urlToken = utils.cutIdFromUrl(remediationUrl)
    const vendorRemediate = {
        transaction_id: transaction_id,
        challenge: challenge,
        url_signature: crypto.sign(null, Buffer.from(urlToken), keys.private).toString('base64'),
        remediation_verb: remediation_verb
    }
    
    const token = getToken(transaction_id)
    switch (remediation_verb) {
        case 'REFRESH':
            vendorRemediate.token = utils.objectToBase64(generateRefreshedToken(token))
            break
        case 'MODIFY':
            vendorRemediate.modified_amount = modified_amount
            vendorRemediate.token = utils.objectToBase64(generateModifiedToken(token, modified_amount))
            break
    }

    return vendorRemediate
}

/**
 * Handles a successful change request. Should be called after all checks were made
 * @param {string} transaction_id - The ID of the transaction token. Format: bic_id
 * @param {Object} providerAck - The `ProviderAck` message
 * @param {string} change_verb - The change verb. One of: REFRESH, REVOKE, MODIFY
 */
function handleSuccessfulRemediation(transaction_id, providerResponse, remediation_verb) {
    switch (remediation_verb) {
        case 'REVOKE':
            delete protocolState.tokens[transaction_id]
            delete protocolState.tokenChangeUrls[transaction_id]
            break
        case 'REFRESH':
            protocolState.tokens[transaction_id] = utils.base64ToObject(providerResponse.token)
            break
        case 'MODIFY':
            if (providerResponse.modification_status == 'ACCEPTED') {
                protocolState.tokens[transaction_id] = utils.base64ToObject(providerResponse.token)
            }
            break
    }
}

/**
 * Make a change request for a given token
 * @param {string} transaction_id - The ID of the transaction token. Format: bic_id
 * @param {string} change_verb - The change verb. One of: REFRESH, REVOKE, MODIFY
 * @param {Object?} modificationData - The modification data
 * @param {number} modificationData.amount - The amount of the modification 
 * @param {string} modificationData.currency - The currency code of the modification
 * @param {string?} modificationData.period - The recurrance period of the modification. One of: null, monthly, quarterly, annual
 * @returns {[string?, string?]} The result of the change request. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function remediateToken(transaction_id, remediation_verb, modified_amount = null) {
    const vendorRemediate = generateVendorRemediate(transaction_id, remediation_verb, modified_amount)
    const remediationUrl = protocolState.tokenChangeUrls[transaction_id]
    const providerResponse = await utils.postStpRequest(remediationUrl, vendorRemediate)

    utils.logMsg('ProviderResponse', providerResponse)
    let result = validator.checkProviderResponse(transaction_id, vendorRemediate.challenge, providerResponse)
    if (result) {
        return result
    }
    
    handleSuccessfulRemediation(transaction_id, providerResponse, remediation_verb)
    return [ null, null ]
}

export default {
    recurringOptionToPeriod, recurringPeriodToOption, generateNewTransactionUrl, sendVendorTokenMsg, waitAndSendRequestPin,
    sendVendorAck, handleRevokeRevision, handleFinishModifyRevision, handleUnknownRevision, remediateToken
}
