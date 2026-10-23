// Set D: fresh held-out documents, written BEFORE the integration was built or run on them. Run once; nothing tuned afterwards.
// Truth = private individuals only. Organisations, places, ordinary capitalised words and generic salutations are negatives.
export const SET_D = [
  { name: 'D1_discharge_letter', pages: [
`Mercy General Hospital - Discharge Summary (SYNTHETIC)
Patient: [[name|Nkechi Eze]]    DOB: [[dob|08/21/1976]]
Phone: [[phone|(404) 555-0187]]
Dr. [[name|Henrik Lindqvist]] examined the patient on Tuesday. Her husband, [[name|Dimitrios Papadopoulos]], and daughter [[name|Ananya]] waited in the lobby of Piedmont Park Pavilion.
Follow-up is scheduled in Cape Town with Stanford University Medical Group. Nurse [[name|Esperanza Ortiz]] will call. Dear Valued Customer, please keep this letter.`,
`Page 2. [[name|Nkechi]] should avoid driving for a week. Contact [[email|nkechi.eze@example.invalid]] with questions. Billing: Washington Mutual Health Plan, Lincoln Park Billing Office.` ] },
  { name: 'D2_legal_letter', pages: [
`Re: Case 2026-0098. Our client, [[name|Takumi Sasaki]], retained Baker McKenzie and Johnson Controls Legal.
Counsel for the Plaintiff, [[name|Gianluca Ferrari]], met the defendant's representative, [[name|Amara Okeke]], in Buenos Aires on Monday. Witnesses: [[name|Jin-woo Park]]; [[name|Carlos Mendoza-Ruiz]]; [[name|Lukas Brandt]].
Dear Sir or Madam, the Hilton Garden Inn near Brooklyn Bridge confirmed the booking. Sincerely, the Office of the Clerk.` ] },
  { name: 'D3_itinerary', pages: [
`Itinerary for [[name|Ngozi Adebayo]] and [[name|Rajesh Subramanian]] (SYNTHETIC). Flight on Delta Air Lines to Rio de Janeiro, then San Jose and Georgia. Hotel: Summit Partners Suites.
Traveller [[name|Rajesh]] will meet Wayne Enterprises at Kent State on Friday. Please email [[email|r.subramanian@example.invalid]] or call [[phone|+44 20 7946 0958]].
Emergency contact: [[name|Soo-ah Kim]], [[address|18 Willow Court, Chicago, IL 60614]].` ] },
  { name: 'D4_meeting_notes', pages: [
`Notes: per [[name|Fatoumata]] we should ask [[name|Lukas]] and [[name|Ngozi Eze]] to review the Quarterly Plan. Present: [[name|Elif Yilmaz]]; [[name|Bartosz Kowalczyk]]; [[name|Ioana Popescu]]; [[name|Mohammad Reza Tehrani]].
Locations discussed: Lake Tahoe, New Mexico, Mount Fuji. Companies: Morgan Hamilton Partners and Taylor Wessing. The Board meets in March. Holiday Inn Express will host.` ] },
];
