// Synthetic, fictional documents with ground truth markup [[category|text]]. Org addresses/phones are deliberately NOT marked
// (they are not personal data) so they count as false positives, which is what a user would experience.
// Set A = development set (used while building the detector). Set B = held-out set, written before tuning; its first-run result is reported untouched.
export const SET_A = [
  { name: 'A1_medical_intake', pages: [
`GREENFIELD FAMILY CLINIC - PATIENT INTAKE (SYNTHETIC)
Patient Name: [[name|Maria Gonzalez-Rivera]]
Date of Birth: [[dob|03/14/1985]]
SSN: [[ssn|512-44-7810]]
Home Address: [[address|482 Maple Ridge Drive, Apt 3B, Springfield, IL 62704]]
Phone: [[phone|(217) 555-0143]]    Email: [[email|maria.gonzalez@example.invalid]]
Insurance Member ID: [[govid|ZXP4402918]]
Emergency Contact: [[name|Luis Gonzalez]]  [[phone|217-555-0178]]`,
`Visit reason: annual checkup. [[name|Maria]] reports no new symptoms and no allergies.
The clinic is located at 1200 Main Street, Springfield, IL 62701.
Next appointment: October 3, 2026 at 9:30 AM. Reference no. 2026-1003-7781.
Total balance due: $1,234,567.89. Software version 3.4.1.` ] },
  { name: 'A2_bank_letter', pages: [
`First Prairie Bank - Account Notice (SYNTHETIC)
Dear Mr. [[name|Andrew Whitfield]],
Your checking account number [[bank|0048271936]] (routing number [[bank|111000025]]) was updated.
Card on file: Visa [[card|4111 1111 1111 1111]], expires 08/29.
Mail statements to [[address|P.O. Box 4410, Dayton, OH 45402]].
Customer service: 1-800-555-0199. Order #4471-2290-1183. Tracking 1Z999AA10123456784.`,
`Customer: [[name|Andrew Whitfield]]
For wire transfers use IBAN [[bank|GB82 WEST 1234 5698 7654 32]].
Amex backup card [[card|3782 822463 10005]].` ] },
  { name: 'A3_hr_record', pages: [
`EMPLOYEE RECORD (SYNTHETIC)
Employee: [[name|Priya Raman]]
DOB: [[dob|1991-07-22]]    Date hired: 2019-02-11
Driver's License: [[govid|D400-1234-5678]]
Passport No: [[govid|X1234567]]
Employee SSN: [[ssn|601-55-0198]]
Home: [[address|77 Oak Street, Austin, TX 78701]]
Mobile: [[phone|+1 512 555 0166]]    Work phone ext 4412
Manager: Dr. [[name|Kenji Nakamura]]
Employee ID: [[govid|EMP-558201]]` ] },
];
export const SET_B = [
  { name: 'B1_rental', pages: [
`Rental Application - Sunset Apartments (SYNTHETIC)
Prospective tenant [[name|Olivia Tran]] (born [[dob|June 9, 1994]]) is applying for Unit 4C.
Current address: [[address|2210 W. Cedar Avenue, Unit 12, Denver, CO 80204]].
She can be reached at [[phone|303.555.0127]] or [[email|olivia.tran@example.invalid]].
Co-signer: [[name|Hector Tran]], SSN [[ssn|123-45-6789]].
Bank: acct [[bank|7702 5513 889]].`,
`[[name|Olivia]]'s credit card [[card|5555 5555 5555 4444]] was used for the application fee.
Landlord: Sunset Properties LLC, 900 Congress Ave, Austin, TX 78701.
Lease starts 09/01/2026. Rent $1,850.00.` ] },
  { name: 'B2_school_form', pages: [
`Student: [[name|Ethan Park]]   Grade: 7   DOB: [[dob|11/02/2012]]
Parent/Guardian: [[name|Sofia Park]]   Phone: [[phone|(415) 555-0192]]
Address: [[address|15 Harbor View Road, San Francisco, CA 94109]]
Student ID: [[govid|S-20481197]]
Notes: [[name|Ethan]] has been doing well. Ms. [[name|Alvarez]] reports good progress.
School: Lincoln Middle School, 500 Learning Lane, San Francisco, CA 94110.` ] },
  { name: 'B3_letter', pages: [
`Hi, this is [[name|Rahul Mehta]] writing about the claim. Call me on [[phone|646-555-0118]].
My social is [[ssn|219 09 9999]] and DOB [[dob|4/9/1979]].
Send the check to [[address|31 Birch Lane, Portland, OR 97205]].
My neighbour [[name|Jamal Carter]] saw the damage, and so did [[name|Oluwaseun Adeyemi]].
Invoice 100234-5567. P.O. 123456789. Please call 911 in an emergency.
Thanks, [[name|Rahul]]` ] },
];
