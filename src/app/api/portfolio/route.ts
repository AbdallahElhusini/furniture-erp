import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireApiSession } from '@/lib/api-auth';

// GET /api/portfolio - Fetch all portfolio projects
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured');
    const search = searchParams.get('search');

    const whereClause: Prisma.PortfolioProjectWhereInput = {};

    if (featured === 'true') {
      whereClause.isFeatured = true;
    }

    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      whereClause.OR = [
        { titleAr: { contains: searchTerm } },
        { titleEn: { contains: searchTerm } },
        { clientName: { contains: searchTerm } },
        { location: { contains: searchTerm } },
        { descriptionAr: { contains: searchTerm } },
        { descriptionEn: { contains: searchTerm } },
      ];
    }

    const portfolioProjects = await prisma.portfolioProject.findMany({
      where: whereClause,
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(portfolioProjects);
  } catch (error: unknown) {
    console.error('Error fetching portfolio projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio projects' },
      { status: 500 }
    );
  }
}

// POST /api/portfolio - Create portfolio project
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const {
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      clientName,
      location,
      images,
      isFeatured,
      sortOrder,
    } = body;

    if (!titleAr || !titleEn) {
      return NextResponse.json(
        { error: 'titleAr and titleEn are required fields' },
        { status: 400 }
      );
    }

    // Format images
    let formattedImages = '[]';
    if (images) {
      if (typeof images === 'string') {
        formattedImages = images;
      } else if (Array.isArray(images)) {
        formattedImages = JSON.stringify(images);
      }
    }

    let finalSortOrder = sortOrder !== undefined ? parseInt(String(sortOrder), 10) : 0;
    if (sortOrder === undefined) {
      const maxSort = await prisma.portfolioProject.aggregate({
        _max: { sortOrder: true },
      });
      finalSortOrder = (maxSort._max.sortOrder || 0) + 1;
    }

    const newPortfolioProject = await prisma.portfolioProject.create({
      data: {
        titleAr,
        titleEn,
        descriptionAr: descriptionAr || null,
        descriptionEn: descriptionEn || null,
        clientName: clientName || null,
        location: location || null,
        images: formattedImages,
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : false,
        sortOrder: finalSortOrder,
      },
    });

    return NextResponse.json(newPortfolioProject, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating portfolio project:', error);
    return NextResponse.json(
      { error: 'Failed to create portfolio project' },
      { status: 500 }
    );
  }
}
