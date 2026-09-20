import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const updateData = {
    offlineInstruments: [
      { sNo: 1, instrumentType: 'Demand Draft' },
      { sNo: 2, instrumentType: 'Bank Guarantee' },
      { sNo: 3, instrumentType: 'Bankers Cheque' },
      { sNo: 4, instrumentType: 'Bankers Pay Order(BPO)' },
      { sNo: 5, instrumentType: 'Fixed deposit' },
      { sNo: 6, instrumentType: 'Saving Certificates' },
      { sNo: 7, instrumentType: 'CDR (Cash Deposit)' }
    ],
    coversInfo: [
      { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: '(All Required Documents as per NIT (i.e., Registration Certificate, GST, contact detail etc.)', documentType: '.pdf' },
      { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: 'EMD(CDR) and Cost of e-Bid(Treasury Challan)', documentType: '.pdf' },
      { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: 'Other Documents', documentType: '.rar' },
      { coverNo: 1, coverType: 'Fee/PreQual/Technical', description: 'SBD', documentType: '.pdf' },
      { coverNo: 2, coverType: 'Finance', description: 'BOQ', documentType: '.xls' }
    ],
    tenderFee: 210,
    tenderFeeExemptionAllowed: 'Yes',
    feePayableTo: 'Executive Engineer ED Baramulla',
    feePayableAt: 'Jammu and Kashmir',
    emdAmount: 2908,
    emdFeeType: 'fixed',
    emdPercentage: 'NA',
    emdPayableTo: 'Executive Engineer ED Baramulla',
    emdPayableAt: 'Jammu and Kashmir',
    emdExemptionAllowed: 'Yes',
    tendererClass: 'Class A',
    clarificationStartDate: '19-Sep-2026 06:30 PM',
    clarificationEndDate: '21-Sep-2026 04:00 PM',
    invitingAuthorityName: 'Executive Engineer ED Baramulla',
    invitingAuthorityAddress: 'Executive Engineer ED Baramulla',
    preBidMeetingDate: null,
    preBidMeetingPlace: 'NA',
    preBidMeetingAddress: 'NA'
  };

  const res = await mongoose.connection.db.collection('tenders').updateOne(
    { sourceTenderId: '2026_PDD_321891_2' },
    { $set: updateData }
  );

  console.log('Update result for 2026_PDD_321891_2:', res);
  await mongoose.disconnect();
}

main().catch(console.error);
