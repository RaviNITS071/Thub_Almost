/**
 * @file backend/src/controllers/tender.controller.js
 * @description Handles all business logic for Tender retrieval, filtering, AI analysis queuing, and dashboard statistics.
 */

import mongoose from 'mongoose';
import Tender from '../models/Tender.js';
import { aiQueue } from '../workers/queue.js';

/**
 * Fetch a paginated list of tenders from the database with advanced filtering.
 * Maps incoming query parameters (search, organisation, department, location, closingDays) 
 * directly to the MongoDB schema.
 * 
 * @route GET /api/v1/tenders
 * @param {Object} req.query - URL query parameters passed from the frontend
 */
export const getTenders = async (req, res, next) => {
  try {
    // 1. Extract query parameters with defaults for pagination, status, and sorting
    const { 
      page = 1, 
      limit = 10, 
      search, 
      category,
      organisation, 
      department, 
      location, 
      closingDays,
      status = 'active', // 'active' | 'archived' | 'all'
      sortBy = 'arrival' // 'arrival' | 'closingAsc' | 'closingDesc' | 'valueDesc' | 'valueAsc'
    } = req.query;
    
    // Helper to safely escape regex special characters
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Base filter conditions matching textual criteria (shared by active/archived counts)
    const baseQuery = {};

    // 2. Specific Category Filter (Matches productCategory or tenderCategory)
    if (category) {
      const escapedCategory = escapeRegex(category);
      baseQuery.$or = [
        { productCategory: { $regex: escapedCategory, $options: 'i' } },
        { tenderCategory: { $regex: escapedCategory, $options: 'i' } }
      ];
    }
    
    // 3. Advanced Search Filter (Matches Title, Description, Tender IDs, Product & Tender Categories)
    if (search) {
      const escapedSearch = escapeRegex(search);
      const searchOr = [
        { title: { $regex: escapedSearch, $options: 'i' } },
        { workDescription: { $regex: escapedSearch, $options: 'i' } },
        { tenderReferenceNumber: { $regex: escapedSearch, $options: 'i' } },
        { sourceTenderId: { $regex: escapedSearch, $options: 'i' } },
        { organisationChain: { $regex: escapedSearch, $options: 'i' } },
        { departmentName: { $regex: escapedSearch, $options: 'i' } },
        { location: { $regex: escapedSearch, $options: 'i' } },
        { productCategory: { $regex: escapedSearch, $options: 'i' } },
        { tenderCategory: { $regex: escapedSearch, $options: 'i' } }
      ];

      if (baseQuery.$or) {
        baseQuery.$and = [
          { $or: baseQuery.$or },
          { $or: searchOr }
        ];
        delete baseQuery.$or;
      } else {
        baseQuery.$or = searchOr;
      }
    }

    // 4. Organisation & Department Filter (Searches inside organisationChain)
    // If both are provided, we use $and to ensure both words exist in the chain
    if (organisation || department) {
      const orgConditions = [];
      if (organisation) orgConditions.push({ organisationChain: { $regex: escapeRegex(organisation), $options: 'i' } });
      if (department) orgConditions.push({ organisationChain: { $regex: escapeRegex(department), $options: 'i' } });

      if (baseQuery.$and) {
        baseQuery.$and.push(...orgConditions);
      } else if (orgConditions.length > 1) {
        baseQuery.$and = orgConditions;
      } else {
        baseQuery.organisationChain = orgConditions[0].organisationChain;
      }
    }

    // 5. Location Filter (searches location, title, or organisationChain where districts are commonly recorded)
    if (location) {
      const locOr = [
        { location: { $regex: escapeRegex(location), $options: 'i' } },
        { title: { $regex: escapeRegex(location), $options: 'i' } },
        { organisationChain: { $regex: escapeRegex(location), $options: 'i' } }
      ];

      if (baseQuery.$and) {
        baseQuery.$and.push({ $or: locOr });
      } else if (baseQuery.$or) {
        baseQuery.$and = [
          { $or: baseQuery.$or },
          { $or: locOr }
        ];
        delete baseQuery.$or;
      } else {
        baseQuery.$or = locOr;
      }
    }

    const now = new Date();

    // Compute live counts for tabs (Latest / Active vs. Archived / Expired)
    const activeCount = await Tender.countDocuments({ ...baseQuery, closingDate: { $gte: now } });
    const archivedCount = await Tender.countDocuments({ ...baseQuery, closingDate: { $lt: now } });

    // 5. Build final query with status and closing date criteria
    const query = { ...baseQuery };

    if (status === 'archived') {
      // Archived tenders are those that have already expired
      query.closingDate = { $lt: now };
    } else if (status === 'all') {
      // No automatic closingDate restriction
      if (closingDays) {
        const days = parseInt(closingDays, 10);
        if (!isNaN(days)) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + days);
          query.closingDate = { $gte: now, $lte: targetDate };
        }
      }
    } else {
      // Default: 'active' (latest tenders currently open for bidding)
      if (closingDays) {
        const days = parseInt(closingDays, 10);
        if (!isNaN(days)) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + days);
          query.closingDate = { $gte: now, $lte: targetDate };
        } else {
          query.closingDate = { $gte: now };
        }
      } else {
        query.closingDate = { $gte: now };
      }
    }

    // 6. Sort Configuration: Default to Most Recent Published Date First
    let sortConfig = { publishedDate: -1, createdAt: -1, _id: -1 };
    if (sortBy === 'closingAsc') {
      sortConfig = { closingDate: 1, publishedDate: -1 };
    } else if (sortBy === 'closingDesc') {
      sortConfig = { closingDate: -1, publishedDate: -1 };
    } else if (sortBy === 'valueDesc') {
      sortConfig = { estimatedValue: -1, publishedDate: -1 };
    } else if (sortBy === 'valueAsc') {
      sortConfig = { estimatedValue: 1, publishedDate: -1 };
    } else if (sortBy === 'publishedAsc') {
      sortConfig = { publishedDate: 1, createdAt: 1, _id: 1 };
    } else {
      // Default: 'arrival', 'publishedDesc', 'latest', or undefined -> Newest Published First
      sortConfig = { publishedDate: -1, createdAt: -1, _id: -1 };
    }

    // 7. Execute Database Query
    const tenders = await Tender.find(query)
      .sort(sortConfig)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Get the total count of documents matching the active query for frontend pagination controls
    const total = await Tender.countDocuments(query);

    // 8. Send Response Payload
    res.status(200).json({
      data: tenders,
      meta: { 
        total, 
        page: Number(page), 
        limit: Number(limit),
        activeCount,
        archivedCount
      }
    });
  } catch (error) {
    // Pass errors to the global error handler middleware
    next(error);
  }
};

/**
 * Fetch a single tender document by its unique database ID.
 * 
 * @route GET /api/v1/tenders/:id
 * @param {string} req.params.id - The MongoDB ObjectId of the tender
 */
export const getTenderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let tender = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      tender = await Tender.findById(id).lean();
    }
    if (!tender) {
      tender = await Tender.findOne({ sourceTenderId: id }).lean();
    }
    
    // Handle case where record does not exist
    if (!tender) return res.status(404).json({ error: 'Tender not found' });
    
    // A tender has siblings ONLY IF explicitly detected during scraping on an intermediate multi-item page
    let relatedTenders = [];
    if (tender.isMultiTender && Array.isArray(tender.relatedTenderIds) && tender.relatedTenderIds.length > 0) {
      relatedTenders = await Tender.find({
        sourceTenderId: { $in: tender.relatedTenderIds }
      })
      .select('sourceTenderId title estimatedValue publishedDate publishedDateStr closingDate status')
      .sort({ sourceTenderId: 1 })
      .lean();
    }

    const isMultiTender = !!(tender.isMultiTender && relatedTenders.length > 0);

    res.status(200).json({
      ...tender,
      isMultiTender,
      relatedTenders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Dispatch an asynchronous background job to analyze a tender document using AI.
 * Pushes the task into a BullMQ message queue for decoupled background processing.
 * 
 * @route POST /api/v1/tenders/:id/analyze
 * @param {string} req.params.id - The ID of the tender being analyzed
 */
export const triggerAiAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // NOTE: In production, these variables should be dynamically extracted 
    // from the actual PDF file stored in an S3 bucket or equivalent.
    const mockDocumentText = "Extracted text from the tender PDF goes here...";
    const mockDocumentHash = "abc123hash"; 

    // Add the AI extraction task to the Redis worker queue
    const job = await aiQueue.add('analyze-tender', {
      tenderId: id,
      documentText: mockDocumentText,
      documentHash: mockDocumentHash
    });

    // Return a 202 Accepted status indicating the job is queued
    res.status(202).json({ message: 'AI Analysis queued successfully', jobId: job.id });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate and fetch real-time aggregated statistics for the platform dashboard.
 * Utilizes MongoDB aggregation pipelines for optimal querying performance.
 * 
 * @route GET /api/v1/tenders/stats
 */
export const getTenderStats = async (req, res, next) => {
  try {
    const now = new Date();

    // 1. Total active tenders count
    const activeTendersCount = await Tender.countDocuments({ closingDate: { $gte: now } });

    // 2. Total unique issuing authorities based on the organisationChain field for active tenders
    const authorities = await Tender.distinct('organisationChain', { closingDate: { $gte: now } });
    const authoritiesCount = authorities.length;

    // 3. Total monetary value pipeline of active tenders
    const valueAggregation = await Tender.aggregate([
      { $match: { closingDate: { $gte: now } } },
      { $group: { _id: null, totalValue: { $sum: "$estimatedValue" } } } 
    ]);
    const totalValue = valueAggregation.length > 0 ? valueAggregation[0].totalValue : 0;

    // 4. Real Domain / Product category breakdown for active tenders
    const domainBreakdown = await Tender.aggregate([
      { $match: { closingDate: { $gte: now }, productCategory: { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: "$productCategory",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    // 5. Broad Categories (Works, Services, Goods) for active tenders
    const categoryBreakdown = await Tender.aggregate([
      { $match: { closingDate: { $gte: now }, tenderCategory: { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: "$tenderCategory",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // 5b. Department / Organization breakdown for active tenders
    const departmentBreakdown = await Tender.aggregate([
      { $match: { closingDate: { $gte: now }, organisationChain: { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: "$organisationChain",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // 6. Latest 4 active tenders for real live showcase
    const latestTenders = await Tender.find(
      { closingDate: { $gte: now } },
      'title sourceTenderId tenderCategory productCategory estimatedValue organisationChain closingDate publishedDate location'
    )
      .sort({ publishedDate: -1, createdAt: -1 })
      .limit(4);

    // Send the computed metrics to the frontend stats section
    res.status(200).json({
      activeTendersCount,
      authoritiesCount,
      totalValue,
      domainBreakdown: domainBreakdown.map((d) => ({
        name: d._id,
        count: d.count,
        totalValue: d.totalValue
      })),
      categoryBreakdown: categoryBreakdown.map((c) => ({
        name: c._id,
        count: c.count,
        totalValue: c.totalValue
      })),
      departmentBreakdown: departmentBreakdown.map((d) => {
        const parts = (d._id || '').split('||').map((p) => p.trim());
        const shortName = parts[parts.length - 1] || parts[0] || 'Department';
        const rootOrg = parts[0] || '';
        return {
          fullName: d._id,
          shortName,
          rootOrg,
          count: d.count,
          totalValue: d.totalValue
        };
      }),
      latestTenders
    });
  } catch (error) {
    console.error("Error calculating tender stats:", error);
    next(error);
  }
};

/**
 * Streams the tender's ZIP archive from R2 storage via the backend.
 * Bypasses direct browser CORS limitations on Cloudflare R2 pub-* domains.
 * 
 * @route GET /api/v1/tenders/:id/zip
 */
export const downloadTenderZip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tender = await Tender.findById(id).lean();
    if (!tender) {
      return res.status(404).json({ message: 'Tender not found' });
    }

    const zipUrl = tender.boqZipUrl || (tender.boqFileUrl && tender.boqFileUrl.toLowerCase().endsWith('.zip') ? tender.boqFileUrl : null);
    if (!zipUrl) {
      return res.status(404).json({ message: 'No ZIP archive found for this tender' });
    }

    const response = await fetch(zipUrl);
    if (!response.ok) {
      return res.status(502).json({ message: 'Failed to retrieve archive from storage' });
    }

    const fileName = tender.zipFileName || `Tender_Packet_${tender.sourceTenderId || id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    next(error);
  }
};