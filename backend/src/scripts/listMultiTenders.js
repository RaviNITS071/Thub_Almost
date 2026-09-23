import 'dotenv/config';
import mongoose from 'mongoose';

async function list() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.db.collection('tenders');

  const aggregation = await collection.aggregate([
    {
      $match: {
        sourceTenderId: { $regex: /_\d+$/ }
      }
    },
    {
      $project: {
        _id: 1,
        sourceTenderId: 1,
        basePattern: {
          $arrayElemAt: [
            { $split: ['$sourceTenderId', { $concat: ['_', { $arrayElemAt: [{ $split: ['$sourceTenderId', '_'] }, -1] }] }] },
            0
          ]
        },
        tenderReferenceNumber: 1,
        departmentName: 1,
        title: 1,
        'workItemDetails.title': 1,
        'workItemDetails.tenderValue': 1,
        isMultiTender: 1,
        relatedTenderIds: 1
      }
    },
    {
      $group: {
        _id: '$basePattern',
        count: { $sum: 1 },
        dept: { $first: '$departmentName' },
        ref: { $first: '$tenderReferenceNumber' },
        tenders: {
          $push: {
            id: '$_id',
            sourceTenderId: '$sourceTenderId',
            title: { $ifNull: ['$workItemDetails.title', '$title'] },
            tenderValue: '$workItemDetails.tenderValue',
            isMultiTender: '$isMultiTender',
            relatedTenderIds: '$relatedTenderIds'
          }
        }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    },
    {
      $sort: { count: -1, _id: 1 }
    }
  ]).toArray();

  console.log(`======================================================================`);
  console.log(`TOTAL MULTI-TENDER NIT GROUPS IN DATABASE: ${aggregation.length}`);
  console.log(`======================================================================\n`);

  const topGroups = aggregation.slice(0, 6);
  topGroups.forEach((group, index) => {
    console.log(`[Group ${index + 1}] Base NIT ID: ${group._id}`);
    console.log(`  - Department: ${group.dept || 'N/A'}`);
    console.log(`  - NIT Ref: ${group.ref || 'N/A'}`);
    console.log(`  - Total Sibling Items: ${group.count}`);
    const ids = group.tenders.map(t => t.sourceTenderId);
    console.log(`  - Sibling Source Tender IDs:`);
    console.log(`    ${ids.join(', ')}\n`);
  });

  await mongoose.disconnect();
}

list().catch(console.error);

