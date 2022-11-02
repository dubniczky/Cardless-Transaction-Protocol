import express from 'express'
import crypto from 'crypto'
import path from 'path'

const app = express()
const port = 3000
const ongoingRequests = {}
const ongoingResponses = {}
const transTokens = []

app.set('views', 'views')
app.set('view engine', 'ejs')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/', express.static('public'))

app.post('/gen_url', async (req, res) => {
    if (!req.body.amount || !req.body.currency || !req.body.recurring) {
        return res.sendStatus(400)
    }
    
    const uuid = crypto.randomUUID()
    const pin = crypto.randomInt(1000, 10000)
    ongoingRequests[uuid] = {
        "amount": req.body.amount,
        "currency": req.body.currency,
        "period": req.body.recurring == 'one_time' ? null : req.body.recurring,
        "pin": pin
    }
    return res.render('show_url', {
        "url": `http://localhost:${port}/api/ctp/request/${uuid}`,
        "pin": pin
    })
})

app.post('/api/ctp/request/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    if (!(uuid in ongoingRequests)) {
        return res.sendStatus(400)
    }

    const currReq = ongoingRequests[uuid]
    delete ongoingRequests[uuid]
    const transId = crypto.randomUUID()
    ongoingResponses[transId] = currReq
    return res.send({
        "transactionID": transId,
        "responseUrl": `http://localhost:${port}/api/ctp/response/${transId}`,
        "vendorName": 'CTP Demo Vendor',
        "vendorLogoUrl": 'https://i.insider.com/602ee9ced3ad27001837f2ac?width=700',
        "amount": currReq.amount,
        "currencyCode": currReq.currency,
        "period": currReq.period
    })
})

app.post('/api/ctp/response/:uuid', async (req, res) => {
    const uuid = req.params.uuid
    if (!(uuid in ongoingResponses)) {
        return res.status(400).send({
            "success": false,
            "reason": 'Invalid UUID'
        })
    }

    if (!('allow' in req.body)) {
        return res.status(400).send({
            "success": false,
            "reason": 'Missing status'
        })
    }

    if (!req.body.allow) {
        return res.status(200).send({
            "success": false,
            "reason": 'Transaction disallowed'
        })
    }

    if (!('token' in req.body) || !('pin' in req.body)) {
        return res.status(400).send({
            "success": false,
            "reason": 'Missing fields'
        })
    }

    const currRes = ongoingResponses[uuid]
    delete ongoingResponses[uuid]
    if (currRes.pin !== req.body.pin) {
        return res.status(400).send({
            "success": false,
            "reason": 'Incorrect PIN'
        })
    }
    
    transTokens.push({
        "amount": currRes.amount,
        "currency": currRes.currency,
        "period": currRes.period,
        "token": req.body.token
    })
    console.log(transTokens) // Only for debugging purposes
    
    return res.send({
        "success": true
    })
})

app.listen(port, () => {
    console.log(`Vendor app listening on port http://localhost:${port}`)
})