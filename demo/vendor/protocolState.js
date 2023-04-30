import falcon from '../common/falcon.js'


export const protocolState = {
    ongoing: {
        requests: {},
        responses: {},
        requestPins: {}
    },
    tokens: {},
    tokenRemediationUrls: {}
}

export const keys = {
    private: await falcon.readKey('../keys/vendor_privkey.json'),
    public: await falcon.readKey('../keys/vendor_pubkey.json'),
    bankPublic: await falcon.readKey('../keys/bank_pubkey.json')
}

/**
 * Returns the transaction request with the given UUID. The request is removed from the queue
 * @param {string} uuid - The UUID associated with the request
 * @returns {Object} The transaction request object
 */
export function popOngoingRequest(uuid) {
    const request = protocolState.ongoing.requests[uuid]
    delete protocolState.ongoing.requests[uuid]
    return request
}

/**
 * Returns the transaction request's PIN with the given UUID. The PIN is removed from the queue
 * @param {string} uuid - The UUID associated with the PIN
 * @returns {number} The PIN as a string
 */
export function popOngoingRequestPin(uuid) {
    const pin = protocolState.ongoing.requestPins[uuid]
    delete protocolState.ongoing.requestPins[uuid]
    return pin
}

/**
 * Returns a list of all STP tokens
 * @returns {Object[]} The STP tokens
 */
export function getAllTokensList() {
    return Object.values(protocolState.tokens)
}

/**
 * Returns the token with the given ID
 * @param {string} id - The transaction ID associated with the token
 * @returns {Object} The STP token
 */
export function getToken(id) {
    return protocolState.tokens[id]
}
