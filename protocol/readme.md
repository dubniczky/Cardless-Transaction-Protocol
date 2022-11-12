# Signed Bank Transaction Protocol

_v2_

## Generate QR

The vendor generates a random key URL connecting to its endpoint

pre-signed URL

- max one request every 5 seconds per user to prevent DDoS amplification

```url
https://vendorname.com/api/ctp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

## Bank connects to vendor

from the bank: request
- transaction token
- bank name
- id
- protocol version
- url token signed with bank private key
- ...

## Vendor responds to the bank

vendor verifies the bank signature with it's database of public keys.

from vendor: response

- Transaction id
- response URL
- vendor name
- vendor logo URL
- amount
- currency code
- preferred expiry
- random 4 digit pin
- vendor account id
- max wait time (timestamp)

> verification code displays on the screen (4 num?)

---

```
https://vendorname.com/api/ctp/response/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

## Bank tells vendor about the result

from bank

- transaction ID
- allow or disallow
- signed token with transaction details (signed with second private key shared with the payment provider)
    - expiry
    - amount
    - payment provider id
    - sender account
    - bank's account
    - user's account temporary ID (nonce)

## Vendor confirms the response

from vendor: response

- success or fail
- reason for failure (request expired for example)


## Vendor makes the transaction with the token

...