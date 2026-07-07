import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  RequestTypeReader,
  RequestTypeRecord,
  UserReader,
  UserSummary,
} from '../../request/domain/request.repository';

@Injectable()
export class PrismaRequestTypeReader extends RequestTypeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<RequestTypeRecord | null> {
    const record = await this.prisma.requestType.findUnique({ where: { id } });
    return record ? this.map(record) : null;
  }

  async listActive(): Promise<RequestTypeRecord[]> {
    const records = await this.prisma.requestType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return records.map((r) => this.map(r));
  }

  private map(record: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    fieldSchema: unknown;
    isActive: boolean;
  }): RequestTypeRecord {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      description: record.description,
      fieldSchema: record.fieldSchema,
      isActive: record.isActive,
    };
  }
}

@Injectable()
export class PrismaUserReader extends UserReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<UserSummary | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return { id: user.id, fullName: user.fullName, email: user.email };
  }
}
