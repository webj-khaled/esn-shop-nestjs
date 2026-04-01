import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const colors = ['black', 'white'] as const;
const sizes = ['XS', 'S', 'M', 'L', 'XL'] as const;

export class CreateSessionItemRequest {
  @IsInt()
  @Min(1)
  productId: number;

  @IsIn(colors)
  color: (typeof colors)[number];

  @IsIn(sizes)
  size: (typeof sizes)[number];

  @IsInt()
  @Min(1)
  quantity: number;
}

export class DeliveryAddressRequest {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  phone?: string;

  @IsString()
  @MinLength(3)
  line1: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @MinLength(2)
  city: string;

  @IsString()
  @MinLength(2)
  state: string;

  @IsString()
  @MinLength(2)
  postalCode: string;

  @IsString()
  @MinLength(2)
  country: string;
}

export class CreateSessionRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSessionItemRequest)
  items: CreateSessionItemRequest[];

  @ValidateNested()
  @Type(() => DeliveryAddressRequest)
  deliveryAddress: DeliveryAddressRequest;
}
