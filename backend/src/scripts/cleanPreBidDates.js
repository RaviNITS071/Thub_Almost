import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.db.collection('tenders');

  // Fix tenders where preBidMeetingPlace is 'NA' or 'N/A' but preBidMeetingDate has a fake date
  const result = await collection.updateMany(
    { 
      $or: [
        { preBidMeetingPlace: 'NA' },
        { preBidMeetingPlace: 'N/A' },
        { preBidMeetingPlace: { $exists: false } },
        { preBidMeetingPlace: null }
      ],
      preBidMeetingAddress: { $in: ['NA', 'N/A', null, ''] }
    },
    { 
      $set: { preBidMeetingDate: null } 
    }
  );

  console.log(`✅ Cleaned preBidMeetingDate for ${result.modifiedCount} tender(s) with no pre-bid meeting.`);
  await mongoose.disconnect();
}

main().catch(console.error);
