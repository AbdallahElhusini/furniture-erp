import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { readApiSession, requireApiSession } from '@/lib/api-auth';
import { AUTHENTICATED_ERP_ROLES } from '@/lib/roles';
import {
  parseDeleteTaskCommand,
  parseUpdateTaskCommand,
  TaskCommandError,
} from '@/lib/task-command-bus';
import {
  executePrismaTaskCommand,
  taskCommandContextFromRequest,
} from '@/lib/task-command-prisma';

function errorDetails(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// GET /api/tasks/[id] - Fetch single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request, AUTHENTICATED_ERP_ROLES);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);

    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            client: true,
          },
        },
        technician: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error: unknown) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task', details: errorDetails(error) },
      { status: 500 }
    );
  }
}

// PUT /api/tasks/[id] - Update task (supports Kanban status changes)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  const session = readApiSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const command = parseUpdateTaskCommand(id, body);
    const result = await executePrismaTaskCommand(
      command,
      taskCommandContextFromRequest(request, session),
    );
    const updatedTask = await prisma.task.findUnique({
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

    if (!updatedTask) {
      throw new TaskCommandError(
        'POSTCONDITION_FAILED',
        'Updated task could not be loaded',
        500,
        { taskId: result.taskId },
      );
    }

    const response = NextResponse.json(updatedTask);
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
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', details: errorDetails(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;
  const session = readApiSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const command = parseDeleteTaskCommand(id);
    const result = await executePrismaTaskCommand(
      command,
      taskCommandContextFromRequest(request, session),
    );
    const response = NextResponse.json({
      success: true,
      message: 'تم حذف المهمة بنجاح',
    });
    response.headers.set('x-trace-id', result.metadata.traceId);
    return response;
  } catch (error: unknown) {
    if (error instanceof TaskCommandError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task', details: errorDetails(error) },
      { status: 500 }
    );
  }
}
