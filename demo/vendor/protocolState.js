const protocolState = {
    ongoing: {
        requests: {},
        responses: {},
        requestPins: {},
        challenges: {}
    },
    tokens: {},
    tokenChangeUrls: {}
}

const keys = {
    private: fs.readFileSync('../keys/vendor_privkey.pem'),
    public: fs.readFileSync('../keys/vendor_pubkey.pem'),
    bankPublic: fs.readFileSync('../keys/bank_pubkey.pem')
}

/**
 * Get the protocol's internal state
 * @returns {Object} The state
 */
function getProtocolState() {
    return protocolState
}


function getKeys() {
    return keys
}


function popChallenge(id) {
    const challenge = protocolState.ongoing.challenges[id]
    delete protocolState.ongoing.challenges[id]
    return challenge
}


function getAllTokensList() {
    return Object.values(protocolState.tokens)
}


function getToken(id) {
    return protocolState.tokens[id]
}

export default {
    getProtocolState, getKeys, popChallenge, getAllTokensList, getToken
}