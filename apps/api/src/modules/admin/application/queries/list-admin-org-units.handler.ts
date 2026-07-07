import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

export interface OrgUnitTreeNode {
  id: string;
  name: string;
  path: string;
  head: { id: string; fullName: string } | null;
  children: OrgUnitTreeNode[];
}

interface OrgUnitRecord {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  head: { id: string; fullName: string } | null;
}

@Injectable()
export class ListAdminOrgUnitsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const units = await this.prisma.orgUnit.findMany({
      include: {
        head: { select: { id: true, fullName: true } },
      },
      orderBy: { name: 'asc' },
    });

    const records: OrgUnitRecord[] = units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      path: unit.path,
      parentId: unit.parentId,
      head: unit.head
        ? { id: unit.head.id, fullName: unit.head.fullName }
        : null,
    }));

    return {
      data: this.buildTree(records),
      flat: records.map(({ parentId: _parentId, ...unit }) => unit),
    };
  }

  private buildTree(units: OrgUnitRecord[]): OrgUnitTreeNode[] {
    const nodes = new Map<string, OrgUnitTreeNode>();

    for (const unit of units) {
      nodes.set(unit.id, {
        id: unit.id,
        name: unit.name,
        path: unit.path,
        head: unit.head,
        children: [],
      });
    }

    const roots: OrgUnitTreeNode[] = [];

    for (const unit of units) {
      const node = nodes.get(unit.id)!;
      if (unit.parentId && nodes.has(unit.parentId)) {
        nodes.get(unit.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
