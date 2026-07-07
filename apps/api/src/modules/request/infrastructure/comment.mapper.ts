import type { Comment, User } from '@prisma/client';

type CommentWithAuthor = Comment & { author: User };

export class CommentMapper {
  static toDto(record: CommentWithAuthor) {
    return {
      id: record.id,
      body: record.body,
      isInternal: record.isInternal,
      author: {
        id: record.author.id,
        fullName: record.author.fullName,
      },
      createdAt: record.createdAt.toISOString(),
    };
  }
}
