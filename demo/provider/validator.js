import crypto from 'crypto'

import { protocolState, getToken } from './protocolState.js'
import utils from '../common/utils.js'

/**
 * Validates if a given ongoing transaction negotiation exists
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID
 * @returns {boolean} Whether the transaction negotiation exists
 */
function isOngoingTransaction(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.transactions)
}

/**
 * Validates if a given ongoing challenge exists
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID associated with the challenge
 * @returns {boolean} Whether the challenge exists
 */
function isOngoingChallenge(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.challenges)
}

/**
 * Validates if a given token exists
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID of the token
 * @returns {boolean} Whether the token exists
 */
function doesTokenExist(res, id) {
    return utils.validateRes(res, id in protocolState.tokens,
        'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}

/**
 * Validates if the user input in the token negotiation is correct
 * @param {Request} req - The request object
 * @param {Response} res - The response object
 * @param {Object} transaction - The transaction data
 * @param {string} transaction.token - The vendor STP token as a base64 string
 * @param {string} transaction.response_url - The response URL, where the 2nd phase of the negotiatin should go
 * @param {number} transaction.pin - The PIN necessary to accept the token
 * @param {Object} vendorToken - The vendor STP token
 * @returns {boolean} Whether user input is correct
 */
function checkUserInput(req, res, transaction, vendorToken) {
    return  utils.validateRes(res, req.body.decision === 'accept',
                'USER_DECLINED', 'The user declined the transaction', 'allowed') &&
            utils.validateRes(res, req.body.pin !== transaction.pin,
                'INCORRECT_PIN', 'The user entered an incorrect pin', 'allowed') &&
            utils.validateRes(res, utils.verifyVendorSignatureOfToken(vendorToken),
                'INCORRECT_SIGNATURE', 'The vendor signature of the token is incorrect')
}

/**
 * Validates if the `VendorRemediate` message is correct 
 * @param {Request} req - The `VendorRemediate` request
 * @param {Response} res - The `ProviderResponse` response 
 * @param {string} uuid - The UUID form the request URL
 * @returns {boolean} Whether the `VendorRemediate` message is correct
 */
function checkVendorRemediate(req, res, uuid) {
    return  doesTokenExist(res, req.body.transaction_id) &&
            utils.validateRes(res,
                crypto.verify(null,
                    Buffer.from(uuid),
                    utils.rawKeyStrToPemPubKey(getToken(req.body.transaction_id).signatures.vendor_key),
                    new Buffer(req.body.url_signature, 'base64')
                ),
                'INVALID_SIGNATURE',
                'url_signature is not a valid signature of the vendor')
}

/**
 * Validates if the `VendorResponse` message is correct
 * @param {string} transaction_id - The ID of the token related to the revision
 * @param {string} challenge - The challenge, which is signed by the vendor in the `VendorResponse` message as a base64 string
 * @param {Object} vendorResponse - The `VendorResponse` message
 * @returns {[string, string]?} `[error_code, error_message]` if not correct, otherwise `null`
 */
function checkVendorResponse(transaction_id, challenge, vendorResponse) {
    if (vendorResponse.HTTP_error_code) {
        return [ vendorResponse.HTTP_error_code, vendorResponse.HTTP_error_msg ]
    }
    if (!vendorResponse.success) {
        return [ vendorResponse.error_code, vendorResponse.error_message ]
    }
    if (!utils.verifyChallResponse(challenge, vendorResponse.response, getToken(transaction_id).signatures.vendor_key)) {
        return [ 'AUTH_FAILED', 'The vendor\'s signature of the challenge is not appropriate' ]
    }

    return null
}


export default {
    isOngoingTransaction, isOngoingChallenge, doesTokenExist, checkUserInput, checkVendorRemediate,
    checkVendorResponse
}
