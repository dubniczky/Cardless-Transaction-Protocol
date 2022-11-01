import express from 'express'
import crypto from 'crypto'
import path from 'path'

const app = express()
const port = 3000
const ongoingRequests = {}

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
        "body": req.body.amount,
        "currency": req.body.currency,
        "recurring": req.body.recurring,
        "pin": pin
    }
    return res.render('show_url', {
        "url": `http://localhost:${port}/api/ctp/${uuid}`,
        "pin": pin
    })
})

app.listen(port, () => {
    console.log(`Vendor app listening on port http://localhost:${port}`)
})