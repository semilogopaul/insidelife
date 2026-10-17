import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CITY_TRAVEL_PORT } from '../../common/ports/city-travel.port.js';
import { LifeModule } from '../life/life.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { BusService } from './bus.service.js';
import { CityTravelService } from './city-travel.service.js';
import { FlightBookingEntity } from './entities/flight-booking.entity.js';
import { FlightsService } from './flights.service.js';
import { CoachController, FlightsController } from './travel.controller.js';
import { TravelSystem } from './travel.system.js';

/**
 * Between Lagos and Abuja: commercial flights on a seeded daily timetable (Flights app and airport counter, check-in,
 * gate, missed-flight change fee), the interstate coach, and `CITY_TRAVEL_PORT` for private flights to arrive through.
 */
@Module({
  imports: [SimulationModule, LifeModule, TypeOrmModule.forFeature([FlightBookingEntity])],
  controllers: [FlightsController, CoachController],
  providers: [FlightsService, BusService, CityTravelService, TravelSystem, { provide: CITY_TRAVEL_PORT, useExisting: CityTravelService }],
  exports: [CITY_TRAVEL_PORT],
})
export class TravelModule {}
