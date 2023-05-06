import utils from '../common/utils.js'
import falcon from '../common/falcon.js'
import { protocolState, keys, getToken } from './protocolState.js'

/**
 * Validates if a given ongoing request exists
 * @param {Repsonse} res - The response object
 * @param {string} uuid - The UUID of the request
 * @returns {boolean} Whether the request exists
 */
function isOngoingRequest(res, uuid) {
    return utils.validateRes(res, uuid in protocolState.ongoing.requests)
}

/**
 * Validates if a given ongoing response exists
 * @param {Repsonse} res - The response object
 * @param {string} uuid - The UUID of the response
 * @returns {boolean} Whether the response exists
 */
function isOngoingResponse(res, uuid) {
    return utils.validateRes(res, protocolState.ongoing.responses[uuid])
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
 * Validates if the URL is signed corrently
 * @param {Repsonse} res - The response object
 * @param {string} uuid - The UUID in the URL (the part which is signed)
 * @param {string} signature - Base64 string of the signature
 * @returns {boolean} Whether the URL is signed corrently
 */
async function verifyUrlSignature(res, uuid, signature) {
    return utils.validateRes(res, await falcon.verify(signature, Buffer.from(uuid), 'sha512', keys.bankPublic),
        'INVALID_SIGNATURE', 'url_signature is not a valid signature of the provider')
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
 * Validates if a given token is recurring
 * @param {Repsonse} res - The response object
 * @param {string} id - The transaction ID of the token
 * @returns {boolean} Whether the token is recurring. Returns `false` if the token does not exist
 */
function isTokenRecurring(res, id) {
    return utils.validateRes(res, getToken(id).transaction.recurring,
        'NON_RECURRING', 'Cannot refresh non-recurring transaction token')
}

/**
 * Validates if the `ProviderConfirm` message is correct
 * @param {Request} req - The request object (`ProviderConfirm` message)
 * @param {Response} res - The response object
 * @returns {boolean} Whether the `ProviderConfirm` message is correct
 */
async function checkProviderConfirmMsg(req, res) {
    const token = req.body.token
    return  utils.validateRes(res, req.body.allowed,
                'TRANSACTION_DECLINED', 'The transaction was declined by the user') &&
            utils.validateRes(res, req.body.token,
                'TOKEN_NOT_FOUND', 'The transaction token is not found') &&
            utils.validateRes(res, await utils.verifyProviderSignatureOfToken(token),
                'TOKEN_INVALID', 'The transaction token has an invalid provider signature')
}

/**
 * Validates if the `ProviderRevise` message is correct 
 * @param {Request} req - The `ProviderRevise` request
 * @param {Response} res - The `VendorResponse` response 
 * @param {string} uuid - The UUID form the request URL
 * @returns {boolean} Whether the `ProviderRevise` message is correct
 */
async function checkProviderRevise(req, res, uuid) {
    return  doesTokenExist(res, req.body.transaction_id) &&
            utils.validateRes(res,
                await falcon.verify(req.body.url_signature,
                    Buffer.from(uuid),
                    'sha512',
                    await falcon.importKeyFromToken(getToken(req.body.transaction_id).signatures.provider_key)
                ),
                'INVALID_SIGNATURE',
                'url_signature is not a valid signature of the provider')
}
/**
 * Validates if the `ProviderResponse` message is correct
 * @param {string} transaction_id - The ID of the token related to the revision
 * @param {string} challenge - The challenge, which is signed by the provider in the `ProviderResponse` message as a base64 string
 * @param {Object} providerResponse - The `ProviderResponse` message
 * @returns {[string, string]?} `[error_code, error_message]` if not correct, otherwise `null`
 */
async function checkProviderResponse(transaction_id, challenge, providerResponse) {
    if (providerResponse.HTTP_error_code) {
        return [ providerResponse.HTTP_error_code, providerResponse.HTTP_error_msg ]
    }
    if (!providerResponse.success) {
        return [ providerResponse.error_code, providerResponse.error_message ]
    }
    if (!(await utils.verifyChallResponse(challenge,
            providerResponse.response,
            'sha512',
            await falcon.importKeyFromToken(getToken(transaction_id).signatures.provider_key))
        )) {
        return [ 'AUTH_FAILED', 'The provider\'s signature of the challenge is not appropriate' ]
    }

    return null
}

export default {
    isOngoingRequest, isOngoingResponse, isOngoingChallenge, verifyUrlSignature, doesTokenExist, isTokenRecurring,
    checkProviderRevise, checkProviderConfirmMsg, checkProviderResponse
}
