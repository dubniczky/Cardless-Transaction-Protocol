import fs from 'fs'


export const protocolState = {
    ongoing: {
        requests: {},
        responses: {},
        requestPins: {},
        challenges: {}
    },
    tokens: {},
    tokenChangeUrls: {}
}

export const keys = {
    private: fs.readFileSync('../keys/vendor_privkey.pem'),
    public: fs.readFileSync('../keys/vendor_pubkey.pem'),
    bankPublic: fs.readFileSync('../keys/bank_pubkey.pem')
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
 * Returns the challenge with the given ID. The challenge is removed from the queue
 * @param {string} id - The transaction ID associated with the challenge
 * @returns {string} The challenge as a base64 string
 */
export function popOngoingChallenge(id) {
    const challenge = protocolState.ongoing.challenges[id]
    delete protocolState.ongoing.challenges[id]
    return challenge
}

/**
 * Returns a list of all STP tokens
 * @returns {Object[]} The STP token
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
