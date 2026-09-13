import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { readApiSession, requireApiSession } from '@/lib/api-auth';
import { AUTHENTICATED_ERP_ROLES } from '@/lib/roles';
import {
  parseCreateTaskCommand,
  TaskCommandError,
} from '@/lib/task-command-bus';
import {
  executePrismaTaskCommand,
  taskCommandContextFromRequest,
} from '@/lib/task-command-prisma';

function errorDetails(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// GET /api/tasks - Fetch tasks with filters
export async function GET(request: NextRequest) {
  const unauthorized = requireApiSession(request, AUTHENTICATED_ERP_ROLES);
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const today = searchParams.get('today');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const priority = searchParams.get('priority');
    const projectId = searchParams.get('projectId');
    const technicianId = searchParams.get('technicianId');
    const search = searchParams.get('search');

    const whereClause: Prisma.TaskWhereInput = {};

    // Filter by specific date or today
    if (today === 'true') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      whereClause.dueDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (date) {
      const parsedDate = new Date(date);
      const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0);
      const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999);
      whereClause.dueDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    if (status) {
      whereClause.status = status;
    }

    if (type) {
      whereClause.type = type;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    if (projectId) {
      whereClause.projectId = parseInt(projectId, 10);
    }

    if (technicianId) {
      whereClause.technicianId = parseInt(technicianId, 10);
    }

    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      whereClause.OR = [
        { title: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            status: true,
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
                company: true,
              },
            },
          },
        },
        technician: true,
      },
      orderBy: [
        { dueDate: 'asc' },
        { priority: 'desc' },
      ],
    });

    return NextResponse.json(tasks);
  } catch (error: unknown) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: errorDetails(error) },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  const session = readApiSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const command = parseCreateTaskCommand(body);
    const result = await executePrismaTaskCommand(
      command,
      taskCommandContextFromRequest(request, session),
    );
    const newTask = await prisma.task.findUnique({
      where: { id: result.taskId },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            status: true,
            client: true,
          },
        },
        technician: true,
      },
    });

    if (!newTask) {
      throw new TaskCommandError(
        'POSTCONDITION_FAILED',
        'Created task could not be loaded',
        500,
        { taskId: result.taskId },
      );
    }

    const response = NextResponse.json(newTask, { status: 201 });
    response.headers.set('x-trace-id', result.metadata.traceId);
    return response;
  } catch (error: unknown) {
    if (error instanceof TaskCommandError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task', details: errorDetails(error) },
      { status: 500 }
    );
  }
}
