# Security Specification - Ndlovukazi Membership Applications

## Data Invariants
1. An application must have a valid `idNumber` (13 digits).
2. All required PII fields (email, phone, address) must be present.
3. `submittedAt` must match the server timestamp.
4. Once submitted, an application is immutable (no updates or deletes from the client).

## The Dirty Dozen (Test Payloads)
1. **The Ghost Field**: Payload with an extra `isVerified: true` field. (Should fail schema check)
2. **The Spoofed Owner**: Setting `ownerId` to another user's UID. (Should fail validation)
3. **The ID Poison**: Sending a 2KB string as document ID. (Should fail ID validation)
4. **The PII Leak**: Unauthenticated user attempting to 'get' an application. (Should fail auth check)
5. **The Blanket Read**: Authenticated non-admin user attempting to 'list' all applications. (Should fail auth/role check)
6. **The Update Gap**: Attempting to change the `status` of an application after submission. (Should fail immutable check)
7. **The Future Timestamp**: Sending a `submittedAt` date in the future. (Should fail server timestamp check)
8. **The Tiny Name**: Name field with only 1 character. (Should fail size check)
9. **The Huge Array**: Sending 100 beneficiaries to exhaust resources. (Should fail array size check)
10. **The Orphan write**: Sending a bank account number as a string of 1MB. (Should fail string size check)
11. **The Self-Promotion**: Attempting to create a document in the `admins` collection. (Should fail default deny)
12. **The Type Injection**: Sending `idNumber` as an integer instead of a string. (Should fail type check)

## Proposed Access Control
- `match /applications/{appId}`:
  - `allow create`: If authenticated and `isValidApplication(incoming())`.
  - `allow read`: If `isAdmin()`.
  - `allow update, delete`: Always `false`.
