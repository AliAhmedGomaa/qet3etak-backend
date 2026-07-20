import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WalletTxType } from '../../common/enums/order.enums';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class WalletTransaction {
  @Prop({ type: String, enum: WalletTxType, required: true })
  type!: WalletTxType;

  /** Positive for debt increase / limit raise; negative for payments reducing debt */
  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true, min: 0 })
  balanceAfter!: number;

  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  orderId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const WalletTransactionSchema =
  SchemaFactory.createForClass(WalletTransaction);

@Schema({ timestamps: true, collection: 'wallets' })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true, min: 0, default: 0 })
  creditLimit!: number;

  @Prop({ required: true, min: 0, default: 0 })
  currentDebt!: number;

  @Prop({ type: [WalletTransactionSchema], default: [] })
  transactions!: WalletTransaction[];
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

WalletSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    if (Array.isArray(ret.transactions)) {
      ret.transactions = ret.transactions.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx: any) => ({
          ...tx,
          id: tx._id,
          _id: undefined,
        }),
      );
    }
    return ret;
  },
});
