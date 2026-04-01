import { IsIn, IsOptional, IsString } from 'class-validator';

export class GetProductsQuery {
  @IsOptional()
  @IsString()
  @IsIn(['available', 'unavailable'])
  status?: string;
}
