import crypto from 'crypto'

import utils from '../common/utils.js'
import falcon from '../common/falcon.js'
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
async function sendVendorTokenMsg(req, res, uuid, port) {
    protocolState.ongoing.requestPins[uuid] = req.body.verification_pin
    const currReq = popOngoingRequest(uuid)
    const transId = crypto.randomUUID()
    protocolState.ongoing.responses[transId] = true

    const token = await generateVendorToken(req.body, currReq)
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
    const token = req.body.token
    protocolState.tokens[token.transaction.id] = token
    protocolState.tokenRemediationUrls[token.transaction.id] = req.body.remediation_url
    console.log('Transaction token:', token)
    res.send({
        success: true,
        revision_url: `stp://localhost:${port}/api/stp/revision/${crypto.randomUUID()}`
    })
}

/**
 * Handles successful revoke token revision
 * @param {Request} req - The `ProviderRevise` request 
 * @param {Response} res - The `VendorResponse` response 
 */
async function handleRevokeRevision(req, res) {
    delete protocolState.tokens[req.body.transaction_id]
    delete protocolState.tokenRemediationUrls[req.body.transaction_id]
    res.send({
        success: true,
        response: await utils.signChall(req.body.challenge, keys.private)
    })
}

/**
 * Handles successful finished modification token revision
 * @param {Request} req - The `ProviderRevise` request 
 * @param {Response} res - The `VendorResponse` response
 */
async function handleFinishModifyRevision(req, res) {
    if (req.body.modification_status == 'ACCEPTED') {
        protocolState.tokens[req.body.transaction_id] = utils.decryptToken(utils.hashProviderSignature(getToken(req.body.transaction_id)), req.body.token)
    }
    res.send({
        success: true,
        response: await utils.signChall(req.body.challenge, keys.private)
    })
}

/**
 * Handles unknown revision verb
 * @param {Response} res - The `VendorResponse` response 
 */
function handleUnknownRevision(res) {
    res.send({
        success: false,
        error_code: 'UNKNOWN_REVISION_VERB',
        error_message: 'Unsupported revision_verb'
    })
}

/**
 * Constructs and signs the vendor STP token from the transaction data
 * @param {Object} transaction - The transaction data in an object
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
async function constructAndSignToken(transaction) {
    let token = {
        metadata: {
            version: 1,
            alg: 'sha512',
            enc: 'sha512,aes256',
            sig: 'falcon1024,ed25519'
        },
        transaction: transaction
    }

    const signature = await falcon.sign(Buffer.from(JSON.stringify(token)), keys.private)
    token.signatures = {
        vendor: signature,
        vendor_key: await falcon.exportKeyToToken(keys.public)
    }

    return token
}

/**
 * Generates a new vendor STP token
 * @param {Object} reqBody - The content of the incomming `ProviderHello` message 
 * @param {string} reqBody.transaction_id - The ID of the transaction defined by the provider. Format: bic_id
 * @param {string} reqBody.bic - The Bank Identification Code (BIC) of the provider
 * @param {string} reqBody.customer - The provider's customer identifier encrypted, stored as a base64 string
 * @param {Object} transactionData - The transaction data
 * @param {number|string} transactionData.amount - The amount of the transaction 
 * @param {string} transactionData.currency - The currency code of the transaction
 * @param {string?} transactionData.period - The recurrance period of the transaction. One of: null, monthly, quarterly, annual
 * @returns {Object} The vendor STP token (metadata, transaction, vendor signatures)
 */
async function generateVendorToken(reqBody, transactionData) {
    let transaction = {
        id: reqBody.transaction_id,
        expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now()).toISOString(),
        provider: reqBody.bic,
        amount: parseFloat(transactionData.amount),
        customer: reqBody.customer,
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

    return await constructAndSignToken(transaction)
}

/**
 * Generates a refreshed version of the given token
 * @param {Object} token - The original token
 * @returns {Object} The refreshed token
 */
async function generateRefreshedToken(token) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.expiry = 
        utils.getNextRecurrance(transaction.expiry, transaction.recurring.period)
    transaction.recurring.next = 
        utils.getNextRecurrance(transaction.recurring.next, transaction.recurring.period)
    transaction.recurring.index += 1
    
    return await constructAndSignToken(transaction) 
}

/**
 * Generates the modified token
 * @param {Object} token - The original token 
 * @param {number|string} modified_amount - The modified amount in the new token
 * @returns {Object} The modified token
 */
async function generateModifiedToken(token, modified_amount) {
    let transaction = JSON.parse(JSON.stringify(token.transaction))
    transaction.amount = parseFloat(modified_amount)
    return await constructAndSignToken(transaction)
}

/**
 * Generates the `VendorToken` message
 * @param {string} confirmation_id - The ID of the 2nd round trip of the transaction
 * @param {number} port - The port of the vendor server
 * @param {Object} token - The vendor STP token 
 * @param {Object} transactionData - The transaction data
 * @param {number} transactionData.amount - The amount of the transaction 
 * @param {string} transactionData.currency - The currency code of the transaction
 * @param {string?} transactionData.period - The recurrance period of the transaction. One of: null, monthly, quarterly, annual
 * @returns {Object} The `VendorToken` message
 */
function generateVendorTokenMsg(confirmation_id, port, token, transactionData) {
    return {
        success: true,
        confirmation_id: confirmation_id,
        response_url: `stp://localhost:${port}/api/stp/response/${confirmation_id}`,
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
        token: token
    }
}

/**
* Generates `VendorRemediate` message
 * @param {string} transaction_id - The transaction ID related to the remediation
 * @param {string} remediation_verb - The remediation verb. Now implemented: REVOKE, REFRESH, MODIFY
 * @param {number?} modified_amount - The modified amount in the new token
 * @returns {Object} The `VendorRemediate` message
 */
async function generateVendorRemediate(transaction_id, remediation_verb, modified_amount) {
    const challenge = utils.genChallenge(30)
    const remediationUrl = protocolState.tokenRemediationUrls[transaction_id]
    const urlToken = utils.cutIdFromUrl(remediationUrl)
    const vendorRemediate = {
        transaction_id: transaction_id,
        challenge: challenge,
        url_signature: await falcon.sign(Buffer.from(urlToken), keys.private),
        remediation_verb: remediation_verb
    }
    
    const token = getToken(transaction_id)
    switch (remediation_verb) {
        case 'REFRESH':
            vendorRemediate.token = utils.encryptToken(utils.hashProviderSignature(token), await generateRefreshedToken(token))
            break
        case 'MODIFY':
            vendorRemediate.modified_amount = modified_amount
            vendorRemediate.token = utils.encryptToken(utils.hashProviderSignature(token), await generateModifiedToken(token, modified_amount))
            break
    }

    return vendorRemediate
}

/**
 * Handles a successful token remediation. Should be called after all checks were made
 * @param {string} transaction_id - The ID of the transaction token associated with the remediation
 * @param {Object} providerResponse - The `ProviderResponse` message
 * @param {string} remediation_verb - The remediation verb. One of: REFRESH, REVOKE, MODIFY
 */
function handleSuccessfulRemediation(transaction_id, providerResponse, remediation_verb) {
    switch (remediation_verb) {
        case 'REVOKE':
            delete protocolState.tokens[transaction_id]
            delete protocolState.tokenRemediationUrls[transaction_id]
            break
        case 'REFRESH':
            protocolState.tokens[transaction_id] = providerResponse.token
            break
        case 'MODIFY':
            if (providerResponse.modification_status == 'ACCEPTED') {
                protocolState.tokens[transaction_id] = providerResponse.token
            }
            break
    }
}

/**
 * Make a token remediation for a given token
 * @param {string} transaction_id - The ID of the transaction toke
 * @param {string} remediation_verb - The remediation verb. One of: REFRESH, REVOKE, MODIFY
 * @param {number?} modified_amount - The modified amount in the new token
 * @returns {[string?, string?]} The result of the token remediation. `[ null, null ]` if the no errors, `[ err_code, err_msg ]` otherwise
 */
async function remediateToken(transaction_id, remediation_verb, modified_amount = null) {
    const vendorRemediate = await generateVendorRemediate(transaction_id, remediation_verb, modified_amount)
    const remediationUrl = protocolState.tokenRemediationUrls[transaction_id]
    const providerResponse = await utils.postStpRequest(remediationUrl, vendorRemediate)

    utils.logMsg('ProviderResponse', providerResponse)
    let result = await validator.checkProviderResponse(transaction_id, vendorRemediate.challenge, providerResponse)
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
