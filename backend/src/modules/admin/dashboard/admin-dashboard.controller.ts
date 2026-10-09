import { Controller, Get } from '@nestjs/common';
import { AdminRoute } from '../common/admin.decorators.js';
import { AdminDashboardService, type AdminDashboardDto } from './admin-dashboard.service.js';

@AdminRoute()
@Controller({ path: 'admin/dashboard', version: '1' })
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  /** Players (total, new, online), revenue by day for 30 days, and pending moderation counts. */
  @Get()
  stats(): Promise<AdminDashboardDto> {
    return this.dashboard.stats();
  }
}
