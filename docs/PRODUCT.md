# GymGrid product brief

## Product

GymGrid is an India-first B2B SaaS product for independent gyms and fitness studios. The first commercial plan is ₹9,999 per year plus GST for one branch and up to 100 active members.

## Product surfaces

1. **GymGrid Platform Admin** — internal GymGrid team: tenant onboarding, plan catalogue, subscriptions, support, audits, and platform reporting.
2. **Gym Admin Web Portal** — gym owners and staff: member CRM, membership plans, enrolment, attendance, classes, payments, staff, leads, reports, and operations.
3. **Member Portal** — members: membership status, digital QR pass, schedule, bookings, payments, notices, and profile.
4. **Reception/Kiosk** — fast member lookup and QR check-in.
5. **Android app** — one GymGrid app that is branded per gym. A user with staff/owner rights can switch between a member workspace and a gym-management workspace.

## Tenant model

- A tenant is an `organization`.
- An organization can own one or more `branches`.
- Every tenant-owned record is scoped to an organization; branch-level records are additionally scoped to a branch.
- Platform administrators are separate from tenant users.
- A user may have different roles in different organizations.

## Initial roles

- Platform Admin
- Gym Owner
- Gym Manager
- Receptionist
- Trainer
- Accountant
- Member

## Pricing model

Pricing is data-driven, never hard-coded in the user interface.

| Band | Included active members | Initial annual price |
| --- | ---: | ---: |
| Launch | Up to 100 | ₹9,999 + GST |
| Growth | 101–300 | ₹14,999 + GST |
| Scale | 301–700 | ₹21,999 + GST |
| Enterprise | 701+ or custom needs | Quote-based |

Active member usage is the peak number of members with an active membership during a billing month. Future pricing supports branches, staff limits, messaging credits, branded apps, data migration, kiosk/access hardware, and premium support as add-ons.

## MVP boundaries

The first pilot supports multi-tenant onboarding, authenticated role-based access, member CRM, memberships, manual payment records, check-ins, classes/bookings, owner reporting, imports, and member/staff Android workflows.

Live Razorpay collection, WhatsApp/SMS, custom white-label apps, POS/inventory, access-control hardware, workout programming, and advanced automation follow the pilot.
