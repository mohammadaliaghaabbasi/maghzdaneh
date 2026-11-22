# Maghzdaneh Security Specification (Phase 0 — Payload-First TDD)

## 1. Data Invariants
1. **Default Deny**: Any unmatched path is denied for read and write.
2. **CMS Integrity (`/siteContent/{sectionId}`)**: Publicly readable so visitors immediately see live editorial copy; writable ONLY by verified admins (`email_verified == true` and bootstrapped admin email or `/admins/{uid}`).
3. **Catalog Integrity (`/products/{productId}`)**: Publicly readable; create/update/delete ONLY by verified admins with strict positive numbers and bounded strings.
4. **PII Isolation (`/users/{userId}`)**: Contains customer email, phone, and physical address. Readable and writable ONLY by the owning verified user (`request.auth.uid == userId`) or a verified admin. Self-assigned roles are forbidden: `role` MUST equal `'customer'` on create and is immutable on user update.
5. **Order Ownership & Lifecycle (`/orders/{orderId}`)**:
   - Create requires `userId == request.auth.uid`, `status == 'new'`, `createdAt == request.time`, `updatedAt == request.time`, and bounded `items` list (`size() >= 1 && size() <= 40`).
   - `get` and `list` strictly verify `resource.data.userId == request.auth.uid || isAdmin()`.
   - Customers may ONLY cancel their own `'new'` order (`status: 'new' -> 'canceled'`); terminal states (`done`, `canceled`) are locked for non-admins.
   - Admins may transition order status across all valid states.
6. **Supply Offer Integrity (`/supplyOffers/{offerId}`)**: Authenticated verified users submit offers bound to `userId == request.auth.uid` with `status == 'new'`. Only the submitter or an admin may read; only an admin may update status.
7. **Admin Registry (`/admins/{adminUid}`)**: Strictly read/write by verified admins only; non-admins can never self-promote.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Role Escalation on User Create**: `POST /users/{uid}` with `{ uid, role: "admin", ... }` -> Denied (`role == 'customer'` required).
2. **Shadow Field Injection on User Update**: `PATCH /users/{uid}` adding `{ isAdmin: true }` -> Denied (`affectedKeys().hasOnly(...)`).
3. **Cross-User PII Read**: Authenticated User B reads `GET /users/{userA}` -> Denied (`isOwner || isAdmin`).
4. **Unverified Admin Email Spoof**: User with `email: "mohammadaliaghaabbasi@gmail.com"` and `email_verified: false` writes `/siteContent/home` -> Denied (`email_verified == true` mandated).
5. **Order Identity Spoofing**: User A creates `/orders/ord1` with `userId: "userB"` -> Denied (`incoming().userId == request.auth.uid`).
6. **Order Pre-Completed State Shortcut**: User A creates `/orders/ord2` with `status: "done"` -> Denied (`status == 'new'` required on create).
7. **Terminal Order Tampering**: User A tries to change a `done` or `canceled` order back to `processing` -> Denied (terminal lock).
8. **Order Total Tampering After Creation**: User A updates `/orders/ord1` changing `grandTotal: 1` -> Denied (customer update allowlist permits only `['status', 'updatedAt']`).
9. **Unauthorized CMS Defacement**: Customer attempts to update `/siteContent/home` -> Denied (`isAdmin()` required).
10. **ID Poisoning / Oversized Document ID**: Writing `/products/<200-char-junk>` -> Denied (`isValidId()` max 128 + regex).
11. **Timestamp Forgery**: Creating `/orders/ord3` with client-supplied `createdAt` != `request.time` -> Denied (`incoming().createdAt == request.time`).
12. **Blanket Order List Scraping**: Customer runs unfiltered `collection('orders')` query -> Denied (`allow list` checks `resource.data.userId == request.auth.uid || isAdmin()`).
