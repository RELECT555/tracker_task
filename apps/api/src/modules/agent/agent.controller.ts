import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../shared/presentation/decorators/current-user.decorator';
import { AgentService } from './agent.service';

const QUARTER = /^(?!0000)\d{4}-Q[1-4]$/;

class ChatDto {
  @IsUUID() projectId!: string;
  @Matches(QUARTER) quarterKey!: string;
  @IsString() @MinLength(1) @MaxLength(4000) prompt!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) history?: unknown[];
}

class ChangeDto {
  @IsUUID() workItemId!: string;
  @IsUUID() roleId!: string;
  @IsString() @MinLength(1) @MaxLength(255) personExternalId!: string;
  @Matches(QUARTER) quarterKey!: string;
  @IsNumber() @Min(0) @Max(10_000) estimatedHours!: number;
}

class ApplyDto {
  @IsUUID() projectId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChangeDto)
  changes!: ChangeDto[];
}

@Controller('ai')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('status')
  status() {
    return { configured: this.agent.isConfigured() };
  }

  @Post('chat')
  @HttpCode(200)
  chat(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ChatDto) {
    return this.agent.chat(actor, dto);
  }

  @Post('apply')
  @HttpCode(200)
  async apply(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ApplyDto) {
    return {
      results: await this.agent.apply(actor, dto.projectId, dto.changes),
    };
  }
}
