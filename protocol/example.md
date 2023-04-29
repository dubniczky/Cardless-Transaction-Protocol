# Example Token Negotiation

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
# Bank transaction id. Format: uuid4
transaction_id: 013CCF92-1313-434B-A838-6BE3D9645DD1
# Encrypted ID of the user by the bank
customer: juastf89234r2bewiohfwf6qw
# Signed URL signed by bank private key (vendor can verify with bank public key list) in base64 format
url_signature: SWvwHAstKjI7tRGdJqaUT5eA5mljMP2HAzKqo8fw...
# The PIN will be required to be entered in the application to verify the transaction (2-6 digits)
verification_pin: 1234
```

### VendorOffer

> Success
```yaml
# Bank data accepted by vendor
success: true
# Transaction ID 2 that the bank will have to refer to the transaction on approval
confirmation_id: AD3621AD-2D2D-4BF7-A3EE-A71F054B6847
# Pre-signed response URL that includes the confirmation ID
response_url: stp://vendor.com/api/stp/response/AD3621AD-2D2D-4BF7-A3EE-A71F054B6847
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
    # Amount of the transaction (if null, it is metered)
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
|DUPLICATE_RANDOM|Random nonce verification failed|

The `error_message` can ba customized/localized by the vendor, but not the `error_code`

## 3. Pin display

The pin code is displayed on the vendor's site. That pin is going to verify the transaction is the same as the one on the screen.

## 4. Transaction Response

The user selects approve or deny on the application. If they tap approve, they will be prompted to enter the PIN code displayed on the vendor's site.

### ProviderConfirm

> Success
```yaml
# Whether the user approved or denied the request
allowed: true
# JWT token signed by both the provider and the vendor
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmMiOi...
# Pre-signed url to modify, refresh, revoke token later
remediation_url: stp://provider.com/api/stp/change/26A50373-6290-4EDD-8F8D-ED22C5DE9299
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
# Whether the received token was valid or not
success: true
# Pre-signed url to notify vendor about token changes
revision_url: stp://vendor.com/api/stp/revision/7060129E-4FBC-48CD-AA2A-9FB2E718777E
```

> Failure
```yaml
success: false
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


# Example token

The transaction JWT looks like this:
```yaml
# Data independent of the protocol run: version and algorithms used
metadata:
  # The version of the token
  version: 1
  # The hashing algorithm used for signatures (SHA512)
  alg: sha512,sha3512
  # The encryption of remediation is a symmetric algorithm with the hash of the token
  enc: sha512,aes256
  # The public-key encryption scheme used for signatures
  sig: falcon1024,ed25519
# Transaction details
transaction:
  # Bank transaction id. Format: uuid4
  id: 013CCF92-1313-434B-A838-6BE3D9645DD1
  # The expiry of the token formated as a ISO 8601 string
  expiry: '2023-04-12T20:03:12.477Z'
  # Added by the provider upon first creating the offer
  created_at: '2023-04-12T20:03:12.477Z'
  # The bic of the provider
  provider: REVOLT21
  # The amount of the transaction
  amount: 12.66
  # Encrypted ID of the user by the bank
  customer: juastf89234r2bewiohfwf6qw
  # The currency of the transaction
  currency: USD
  # Recurrance information (null for one-time tokens)
  recurring:
    # The recurrance period (one of: monthly, quarterly, annual)
    period: monthly
    # The next recurrance formated as a ISO 8601 string
    next: '2023-04-12T20:03:12.477Z'
    # The index of the recurrance. Increments with each refresh
    index: 0
# Digital signatures for checking validity
signatures:
  # The vendor's signature of the metadata and the transaction parts of the token
  vendor: oKbfJohV4Nq5rCeWM74uKnFyniAV2Ae9Sbr3Fwdr2H6OEuVzYpJjGYFFOZ+5...
  # The vendor's public key for checking signature validity (PEM format without header, footer and new lines)
  vendor_key: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4iAzt4C4T16wclcCbo9pXZn...
  # Added by the bank when signing the token or signing the refresh or modified version
  signed_at: '2023-04-12T20:03:12.477Z'
  # The provider's signature of the metadata, transaction, vendor and vendor_key parts of the token
  provider: L5oaGF/zyMxmY4r6bZfU/ow5TPoMzvL5xqUjc7//nDiKCzlmdXmE...
  # The provider's public key for checking signature validity (PEM format without header, footer and new lines)
  provider_key: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuLJInsXWreKLvBbQSDGCk...
```

The token is a JSON object. For signatures the tokens are converted to string with `JSON.stringify`


# Example token remediation

If the vendor wants to modify, refresh, revoke any token later, then it can be done by sending a change request to the `remediation_url` sent by the provider previously

## VendorRemediate

### Revoking token

```yaml
# The id of the transaction the vendor wants to change
transaction_id: STPEXPROV_8497404125
# A random challenge to authenticate the provider (30 bytes, 40 base64 characters)
challenge: vKvqQA8BvPmXT/QogPve6briG6dvivo3EXx3p1mj
# Remediation URL signed by the vendor with the key which was used to sign the transaction token (in base64)
url_signature: ldRSWRYYWFwdkpHQ3gwVGZYZnhyWVNPWE1YRlZ0eG9S...
# Remediation verb
remediation_verb: REVOKE
```

### Refreshing token

```yaml
transaction_id: 013CCF92-1313-434B-A838-6BE3D9645DD1
challenge: vKvqQA8BvPmXT/QogPve6briG6dvivo3EXx3p1mj
url_signature: ldRSWRYYWFwdkpHQ3gwVGZYZnhyWVNPWE1YRlZ0eG9S...
remediation_verb: REFRESH
# The refreshed transaction JWT signed by the vendor and encrypted using the metadata.enc method in base64 format
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmM...
```
Refreshing increments the `transaction.recurring.index` and updates the `transaction.recurring.next`

### Modifying token

```yaml
transaction_id: 013CCF92-1313-434B-A838-6BE3D9645DD1
challenge: vKvqQA8BvPmXT/QogPve6briG6dvivo3EXx3p1mj
url_signature: ldRSWRYYWFwdkpHQ3gwVGZYZnhyWVNPWE1YRlZ0eG9S...
remediation_verb: MODIFY
# The new amount
modified_amount: 12.66
# The modified transaction JWT signed by the vendor in base64 format
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmM...
```
The vendor can ONLY modify the `transaction.amount`. For other changes new token negotiation is necessary

## ProviderResponse

### Revoking successful

```yaml
# Whether the authentication and the change was successful
success: true
# The vendor's challenge signed by the key which was used to sign the transaction token (in base64)
response: kV2tD6iuApOm8uspBat+KsXG+fP4Eb+HHkAYOeqmAUeB...
```

### Refreshing successful
```yaml
success: true
response: kV2tD6iuApOm8uspBat+KsXG+fP4Eb+HHkAYOeqmAUeB...
# The refreshed transaction JWT signed both parties and encrypted using the metadata.enc method in base64 format
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmM...
```

### Modification successful

```yaml
success: true
response: kV2tD6iuApOm8uspBat+KsXG+fP4Eb+HHkAYOeqmAUeB...
# Modification status
modification_status: ACCEPTED
# The modified transaction JWT signed by both parties and encrypted using the metadata.enc method in base64 format
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmM...
```

### Modification pending

```yaml
success: true
response: kV2tD6iuApOm8uspBat+KsXG+fP4Eb+HHkAYOeqmAUeB...
# Modification status
modification_status: PENDING
```

### Failure

```yaml
success: false
error_code: AUTH_FAILED
error_message: The vendor's signature of the remediation URL is not valid
```

#### Possible errors:

|error_code|error_message|
|---|---|
|AUTH_FAILED|The vendor's signature of the remediation URL is not valid|
|INCORRECT_TOKEN|The refreshed token contains incorrect data|
|INCORRECT_TOKEN_SIGN|The refreshed token is not signed properly|
|UNKNOWN_REMEDIATION_VERB|Unsupported remediation_verb|
|MODIFICATION_REJECTED|The provider rejected the modification|

The `error_message` can ba customized/localized by the vendor, but not the `error_code`


# Example token revision

The provider can notify the vendor about changes in the token's validity by sending notification to the `revision_url` sent by the vendor in the token negotiation phase. This method can be used to finish pending modification request too.

## ProviderRevise

### Revoking token

```yaml
# The id of the transaction the provider wants to send notification about
transaction_id: STPEXPROV_2057169785
# A random challenge to authenticate the vendor (30 bytes, 40 base64 characters)
challenge: 1dFMqKhh3TGUwkBfW6FmZhE+fURLNcaec0LArkG9
# Revision URL signed by the provider with the key which was used to sign the transaction token (in base64)
url_signature: ldRSWRYYWFwdkpHQ3gwVGZYZnhyWVNPWE1YRlZ0eG9S...
# Revision verb
revision_verb: REVOKE
```

### Accepting pending token modification

```yaml
transaction_id: STPEXPROV_2057169785
challenge: 1dFMqKhh3TGUwkBfW6FmZhE+fURLNcaec0LArkG9
url_signature: ldRSWRYYWFwdkpHQ3gwVGZYZnhyWVNPWE1YRlZ0eG9S...
revision_verb: FINISH_MODIFICATION
# Modification status
modification_status: ACCEPTED
# The modified transaction JWT signed by the both the vendor and the provider in base64 format
token: eyJtZXRhZGF0YSI6eyJ2ZXJzaW9uIjoxLCJhbGciOiJzaGE1MTIiLCJlbmM...
```

### Rejecting pending token modification

```yaml
transaction_id: STPEXPROV_2057169785
challenge: 1dFMqKhh3TGUwkBfW6FmZhE+fURLNcaec0LArkG9
url_signature: ldRSWRYYWFwdkpHQ3gwVGZYZnhyWVNPWE1YRlZ0eG9S...
revision_verb: FINISH_MODIFICATION
modification_status: REJECTED
```

### VendorAck

### Success

```yaml
# Whether the authentication and the revision was successful
success: true
# The provider's challenge signed by the key which was used to sign the transaction token (in base64)
response: kV2tD6iuApOm8uspBat+KsXG+fP4Eb+HHkAYOeqmAUeB...
```

### Failure

```yaml
success: false
error_code: AUTH_FAILED
error_message: The provider's signature of the revision URL is not valid
```

#### Possible errors:

|error_code|error_message|
|---|---|
|AUTH_FAILED|The provider's signature of the revision URL is not valid|
|UNKNOWN_REVISION_VERB|Unsupported revision_verb|

The `error_message` can ba customized/localized by the vendor, but not the `error_code`