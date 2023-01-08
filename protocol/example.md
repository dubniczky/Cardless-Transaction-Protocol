# Example Transaction

## 1. 

User pressed the pay button on the website, presigned URL is generated and presented in the form of an URL.

```url
stp://vendor.com/api/ctp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```


## 2. Transaction Request

The user scans the code and the bank requests the transaction details from the vendor.

### Request: bank -> vendor

```yaml
# CTP protocol version
version: v1
# Display name of the bank
bank_name: mybank
# Bank identifier code
bic: ABCDHUBP001
# Random code attached to the next request (replay attack)
random: kasdf8n4is9chvnaw1w45u9hfd
# Bank transaction id
transaction_id: ABCDHUBP001_aadsfgyjeyrtgaegfa
# signed URL signed by bank private key (vendor can verify with bank public key list)
url_signature: asd
# The PIN will be required to be entered in the application to verify the transaction
verification_pin: "13"
```

### Request: vendor -> bank

> success
```yaml
# Bank data accepted by vendor
success: true
# Transaction ID 2 that the bank will have to refer to the transaction on approval
transaction_id: AD3621AD-2D2D-4BF7-A3EE-A71F054B6847
# Pre-signed response URL that includes the transaction ID
response_url: stp://vendor.com/api/ctp/response/AD3621AD-2D2D-4BF7-A3EE-A71F054B6847
# Vendor data
vendor:
    # Display name
    name: My Vendor
    # Logo URL png/jpg/ico file to load by the app
    logo_url: https://myvendor.com/images/logo.png
    # Address
    address: Washington, Imaginary st. 184
# Transaction details
transaction:
    amount: 14.99
    currency_code: USD
    # Recurrance information (null if not recurring)
    recurrance:
        # Recurrance from next period
        amount: 14.99
        # Recurrance period
        period: 1 month
```

> failure
```yaml
# Bank data denied by vendor
success: false
# Error code
error_code: UNSUPPORTED_VERSION
# Error display text
error_message: The requested version of the CTP protocol is unavailable
```

## 3. Pin display

The pin code is displayed on the vendor's site. That pin is going to verify the transaction is the same as the one on the screen.

## 4. Transaction Response

The user selects approve or deny on the application. If they tap approve, they will be prompted to enter the PIN code displayed on the vendor's site.

### Request: bank -> vendor

```yaml
# Same as the one sent by the vendor
transaction_id: AD3621AD-2D2D-4BF7-A3EE-A71F054B6847
# Whether the user approved or denied the request
allowed: true
# The token which will be used instead of the bank card information
token: PPN:BANK/RDgzOTVFNUYtN0MxMS00NEIwLTg0REItMDRCNTVDODgyRTkwCg
```

- transaction ID
- allow or disallow
- token
- expiry (1 hour?)
- verification pin (4 num?)