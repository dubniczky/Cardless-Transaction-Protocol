# Signed Bank Transaction Protocol

_v3_

## Generate QR

The vendor generates a random signed URL connecting to its endpoint

- limit request rate to prevent DDoS aplification

```url
stp://example.com/stp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

Display URL as a QR code to be read by the bank mobile authenticator

## Bank connects to vendor

connect to `https` endpoint of the vendor

from the bank: request

- transaction token
- bank name
- id
- protocol version
- Url token signed with bank private key (`https`?)
- ...


## The vendor responds to the bank

> vendor verifies the bank signature with its database of public keys. (`https`?)

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
stp://example.com/stp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

## Bank tells the vendor about the result

from the bank: request

- transaction ID
- allow or disallow
- signed token with transaction details (signed with private key/hashing) JWT
    - expiry
    - amount
    - payment provider id
    - sender account
    - bank's account
    - user's account temporary ID (nonce)
    - bank signature

## The vendor confirms the response

from vendor: response

- success or fail
- ?reason for failure (request expired for example)
- vendor checks signature and JWT details


## The vendor makes the transaction with the token

...
