import { getProtocolState, getKeys } from './protocolState'


function validateRes(res, isValid, err_code = null, err_msg = null) {
    if (!isValid) {
        if (err_code && err_msg) {
            res.send({
                success: false,
                error_code: err_code,
                error_message: err_msg
            })
        } else {
            res.sendStatus(400)
        }
        return false
    }
    return true
}

/**
 * Verifies the provider signature of a full STP token
 * @param {Object} token - The full STP token
 * @returns {boolean} The result of the verification
 */
function verifyToken(token) {
    let tokenCopy = utils.copyObject(token)
    delete tokenCopy.signatures.provider
    delete tokenCopy.signatures.provider_key

    let verifier = crypto.createVerify('SHA512')
    verifier.update(Buffer.from(JSON.stringify(tokenCopy)))
    return verifier.verify(
        utils.rawKeyStrToPemPubKey(token.signatures.provider_key),
        Buffer.from(token.signatures.provider, 'base64')
    )
}


function doesBodyContainFields(req, res, fields) {
    return validateRes(res, fields.every((field) => field in req.body))
}


function isOngoingRequest(res, uuid) {
    return validateRes(res, uuid in getProtocolState().ongoing.requests)
}


function isOngoingResponse(res, uuid) {
    return validateRes(res, uuid in getProtocolState().ongoing.responses)
}


function isOngoingChallenge(res, uuid) {
    return validateRes(res, uuid in getProtocolState().ongoing.challenges)
}


function verifyUrlSignature(res, uuid, signature) {
    return validateRes(res, crypto.verify(null, Buffer.from(uuid), getKeys().bankPublic, new Buffer(signature, 'base64')),
        'INVALID_SIGNATURE', 'url_signature is not a valid signature of the provider')
}


function doesTokenExist(res, id) {
    return validateRes(res, id in getProtocolState().tokens, 'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}


function isTokenRecurring(res, id) {
    return validateRes(res, getProtocolState().tokens[id]?.transaction?.recurring, 'NON_RECURRING', 'Cannot refresh non-recurring transaction token')
}


function checkProviderVerifNotify(req, res, id, challenge) {
    if (!validateRes(res, req.body.success)) {
        return false
    }

    return validateRes(res,
        utils.verifyChallResponse(challenge, req.body.response, getProtocolState().tokens[id].signatures.provider_key),
        'AUTH_FAILED', 'The provider\'s response to the challenge was not appropriate')
}


function checkProviderTokenMsg(req, res) {
    if (!validateRes(res, req.body.allowed, 'TRANSACTION_DECLINED', 'The transaction was declined by the user')) {
        return false
    }

    if (!validateRes(res, req.body.token, 'TOKEN_NOT_FOUND', 'The transaction token is not found')) {
        return false
    }

    const token = utils.base64ToObject(req.body.token, 'base64')
    return validateRes(res, verifyToken(token), 'TOKEN_INVALID', 'The transaction token has an invalid provider signature')
}


export default {
    doesBodyContainFields, isOngoingRequest, isOngoingResponse, isOngoingChallenge, verifyUrlSignature, doesTokenExist,
    isTokenRecurring, checkProviderVerifNotify, checkProviderTokenMsg
}
