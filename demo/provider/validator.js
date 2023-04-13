import { protocolState, getToken } from './protocolState.js'
import utils from '../common/utils.js'


function isOngoingTransaction(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.transactions)
}


function isOngoingChallenge(res, id) {
    return utils.validateRes(res, id in protocolState.ongoing.challenges)
}


function doesTokenExist(res, id) {
    return utils.validateRes(res, id in protocolState.tokens,
        'ID_NOT_FOUND', 'The given transaction_id has no associated tokens')
}


function checkUserInput(req, res, transaction, vendorToken) {
    if (!utils.validateRes(res, req.body.decision === 'accept', 'USER_DECLINED', 'The user declined the transaction', 'allowed')) {
        return false
    }
    if (!utils.validateRes(res, req.body.pin !== transaction.pin, 'INCORRECT_PIN', 'The user entered an incorrect pin', 'allowed')) {
        return false
    }
    
    return utils.validateRes(res, utils.verifyVendorSignatureOfToken(vendorToken),
        'INCORRECT_SIGNATURE', 'The vendor signature of the token is incorrect')
}


function checkVendorVerifChange(req, res, id, challenge) {
    if (!utils.validateRes(res, req.body.success, req.body.error_code, req.body.error_message)) {
        return false
    }
    
    return utils.validateRes(res, utils.verifyChallResponse(challenge, req.body.response, getToken(id).signatures.vendor_key),
        'AUTH_FAILED', 'The vendor\'s response to the challenge was not appropriate')
}


function checkVendorVerifChall(vendorVerifChall) {
    if (vendorVerifChall.HTTP_error_code) {
        return [ vendorVerifChall.HTTP_error_code, vendorVerifChall.HTTP_error_msg ]
    }
    if (!vendorVerifChall.success) {
        return [ vendorVerifChall.error_code, vendorVerifChall.error_message ]
    }

    return null
}


function checkVendorAck(vendorAck, providerVerifNotify) {
    if (vendorAck.HTTP_error_code) {
        return [ vendorAck.HTTP_error_code, vendorAck.HTTP_error_msg ]
    }
    if (!providerVerifNotify.success) {
        return [ providerVerifNotify.error_code, providerVerifNotify.error_message ]
    }
    if (!vendorAck.success) {
        return [ vendorAck.error_code, vendorAck.error_message ]
    }

    return null
}


export default {
    isOngoingTransaction, isOngoingChallenge, doesTokenExist, checkUserInput, checkVendorVerifChange,
    checkVendorVerifChall, checkVendorAck
}
