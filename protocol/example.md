# Example Transaction

## 1. VendorQR

User pressed the pay button on the website, presigned URL is generated and presented in the form of a QR code.

```url
stp://vendor.com/api/stp/request/CF45D22C-28B8-41E7-AC78-B6C81580F575
```

## 2. Transaction Request

The user scans the code and the bank requests the transaction details from the vendor.

### ProviderHello

```yaml
# STP protocol version
version: v1
# Display name of the bank
bank_name: mybank
# Bank identifier code
bic: ABCDHUBP001
# Random code attached to the next request to prevent replay attack (30 bytes, 40 base64 characters)
random: gG7HD+JRhc2FszVdPfGR/LF6KTgXxjE1bHXdEU8F
# Bank transaction id. Format: bic_id. The id consists of alphanumeric characters
transaction_id: ABCDHUBP001_aadsfgyjeyrtgaegfa
# Signed URL signed by bank private key (vendor can verify with bank public key list) in base64 format
url_signature: SWvwHAstKjI7tRGdJqaUT5eA5mljMP2HAzKqo8fw...
# The PIN will be required to be entered in the application to verify the transaction
verification_pin: 1234
```

### VendorToken

> Success
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
    # Amount of the transaction
    amount: 14.99
    # The used currency
    currency_code: USD
    # Recurrance information (one of: null, 'monthly', 'quarterly', 'annual')
    recurrance: monthly
# Transaction JWT signed by the vendor in base64 format
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlb...
```

> Failure
```yaml
success: false
error_code: UNSUPPORTED_VERSION
error_message: The requested version of the STP protocol is unavailable
```

#### Possible errors:

|error_code|error_message|
|---|---|
|UNSUPPORTED_VERSION|The requested version of the STP protocol is unavailable|
|INVALID_SIGNATURE|url_signature is not a valid signature of the provider|

The `error_message` can ba customized/localized by the vendor, but not the `error_code`

## 3. Pin display

The pin code is displayed on the vendor's site. That pin is going to verify the transaction is the same as the one on the screen.

## 4. Transaction Response

The user selects approve or deny on the application. If they tap approve, they will be prompted to enter the PIN code displayed on the vendor's site.

### ProviderToken

> Success
```yaml
# Whether the user approved or denied the request
allowed: true
# JWT token signed by both the provider and the vendor
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmMiOi...
```

> Failure
```yaml
allowed: false
error_code: USER_DECLINED
error_message: The user declined the transaction
```

#### Possible errors:

|error_code|error_message|
|---|---|
|USER_DECLINED|The user declined the transaction|
|INCORRECT_PIN|The user entered an incorrect pin|
|INCORRECT_SIGNATURE|The vendor signature of the token is incorrect|

The `error_message` can ba customized/localized by the vendor, but not the `error_code`

### VendorAck

> Success
```yaml
success: true
```

> Failure
```yaml
allowed: false
error_code: TOKEN_NOT_FOUND
error_message: The transaction token is not found
```

#### Possible errors:

|error_code|error_message|
|---|---|
|TRANSACTION_DECLINED|The transaction was declined by the user|
|TOKEN_NOT_FOUND|The transaction token is not found|
|TOKEN_INVALID|The transaction token has an invalid provider signature|

The `error_message` can ba customized/localized by the vendor, but not the `error_code`
