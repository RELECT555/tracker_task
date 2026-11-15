import { Module } from '@nestjs/common';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [RoadmapModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
