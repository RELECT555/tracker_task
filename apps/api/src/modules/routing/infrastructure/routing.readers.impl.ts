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
    defaultRouteTemplateId: string | null;
  }): RequestTypeRecord {
    return {
      id: record.id,
      code: record.code,
      name: record.name,
      description: record.description,
      fieldSchema: record.fieldSchema,
      isActive: record.isActive,
      defaultRouteTemplateId: record.defaultRouteTemplateId,
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

  async findAuthorContext(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, orgUnitId: true, managerId: true, isActive: true },
    });

    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      orgUnitId: user.orgUnitId,
      managerId: user.managerId,
    };
  }

  async findManagerId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { managerId: true, isActive: true },
    });

    if (!user?.isActive || !user.managerId) return null;
    return user.managerId;
  }
}
