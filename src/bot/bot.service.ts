import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Bot, session, Context, SessionFlavor } from 'grammy';
import { PrismaService } from "../prisma/prisma.service";

// Session interfeysi
interface SessionData {
  cart: any[];
  phone: string;
  orderType: string;
  location: { latitude: number; longitude: number } | null;
  addressText: string;
  lastAction: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot<MyContext>;
  private readonly ADMIN_ID: string;
  private readonly WEB_APP_URL = "https://SIZNING_USERNAME.github.io/fastfood-bot-menu/";

  constructor(private prisma: PrismaService) {
    // Environment tekshirish
    if (!process.env.BOT_TOKEN) {
      throw new Error('BOT_TOKEN topilmadi! .env faylni tekshiring');
    }
    if (!process.env.ADMIN_ID) {
      throw new Error('ADMIN_ID topilmadi! .env faylni tekshiring');
    }

    this.ADMIN_ID = process.env.ADMIN_ID;
    this.bot = new Bot<MyContext>(process.env.BOT_TOKEN);
  }

  async onModuleInit() {
    console.log('🤖 Bot sozlanmoqda...');

    try {
      // Session sozlash
      this.bot.use(
        session({
          initial: (): SessionData => ({
            cart: [],
            phone: '',
            orderType: '',
            location: null,
            addressText: '',
            lastAction: 'menu',
          }),
        }),
      );

      this.setupCommands();
      this.setupHandlers();

      // Botni ishga tushirish
      await this.bot.start({
        onStart: (botInfo) => {
          console.log(`✅ Bot ishga tushdi: @${botInfo.username}`);
        },
      });
    } catch (error) {
      console.error('❌ Bot sozlashda xatolik:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    console.log('🛑 Bot to\'xtatilmoqda...');
    await this.bot.stop();
    console.log('✅ Bot to\'xtatildi');
  }

  private setupCommands() {
    // /start buyrug'i
    this.bot.command('start', async (ctx) => {
      try {
        await this.handleStart(ctx);
      } catch (error) {
        console.error('Start xatosi:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Qaytadan /start yozing.');
      }
    });
  }

  private setupHandlers() {
    // Kontakt qabul qilish
    this.bot.on('message:contact', async (ctx) => {
      try {
        await this.handleContact(ctx);
      } catch (error) {
        console.error('Contact xatosi:', error);
        await ctx.reply('❌ Xatolik. Qaytadan urinib ko\'ring.');
      }
    });

    // Buyurtma turi tanlash
    this.bot.callbackQuery('type_delivery', async (ctx) => {
      try {
        await this.handleDeliveryType(ctx);
      } catch (error) {
        console.error('Delivery xatosi:', error);
        await ctx.answerCallbackQuery('❌ Xatolik');
      }
    });

    this.bot.callbackQuery('type_pickup', async (ctx) => {
      try {
        await this.handlePickupType(ctx);
      } catch (error) {
        console.error('Pickup xatosi:', error);
        await ctx.answerCallbackQuery('❌ Xatolik');
      }
    });

    // Lokatsiya qabul qilish
    this.bot.on('message:location', async (ctx) => {
      try {
        await this.handleLocation(ctx);
      } catch (error) {
        console.error('Location xatosi:', error);
        await ctx.reply('❌ Lokatsiya qabul qilinmadi.');
      }
    });

    // Web App ma'lumotlari
    this.bot.on('message:web_app_data', async (ctx) => {
      try {
        await this.handleWebAppData(ctx);
      } catch (error) {
        console.error('WebApp xatosi:', error);
        await ctx.reply('❌ Buyurtma yuborishda xatolik.');
      }
    });

    // Text xabarlar
    this.bot.on('message:text', async (ctx) => {
      try {
        await this.handleText(ctx);
      } catch (error) {
        console.error('Text xatosi:', error);
      }
    });

    // Admin callback'lari
    this.bot.callbackQuery(/^accept_(\d+)_(\d+)$/, async (ctx) => {
      try {
        await this.handleAcceptOrder(ctx);
      } catch (error) {
        console.error('Accept xatosi:', error);
      }
    });

    this.bot.callbackQuery(/^reject_(\d+)$/, async (ctx) => {
      try {
        await this.handleRejectOrder(ctx);
      } catch (error) {
        console.error('Reject xatosi:', error);
      }
    });

    this.bot.callbackQuery(/^contact_(\d+)$/, async (ctx) => {
      try {
        await this.handleContactAdmin(ctx);
      } catch (error) {
        console.error('Contact admin xatosi:', error);
      }
    });

    // Xatolarni ushlash
    this.bot.catch((err) => {
      console.error('❌ Bot global error:', err);
    });
  }

  // ========================================
  // HANDLER METODLARI
  // ========================================

  private async handleStart(ctx: MyContext) {
    // Session tozalash
    ctx.session.cart = [];
    ctx.session.phone = '';
    ctx.session.orderType = '';
    ctx.session.location = null;
    ctx.session.addressText = '';
    ctx.session.lastAction = 'registration';

    // Foydalanuvchini bazaga qo'shish
    await this.prisma.user.upsert({
      where: { telegramId: ctx.from.id.toString() },
      update: { phone: '' },
      create: {
        telegramId: ctx.from.id.toString(),
        phone: '',
        name: ctx.from.first_name || 'Foydalanuvchi',
      },
    });

    await ctx.reply(
      '🍕 *Presto Pizza*ga xush kelibsiz!\n\nXizmat ko\'rsatishimiz uchun raqamingizni yuboring:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: '📞 Raqamni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  private async handleContact(ctx: MyContext) {
    if (!ctx.message?.contact) return;

    const phone = ctx.message.contact.phone_number;
    ctx.session.phone = phone;

    await this.prisma.user.upsert({
      where: { telegramId: ctx.from.id.toString() },
      update: { phone },
      create: {
        telegramId: ctx.from.id.toString(),
        phone,
        name: ctx.from.first_name || 'Foydalanuvchi',
      },
    });

    await ctx.reply('✅ Ro\'yxatdan o\'tdingiz!\n\nXizmat turini tanlang:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚖 Yetkazib berish', callback_data: 'type_delivery' },
            { text: '🛍 Olib ketish', callback_data: 'type_pickup' },
          ],
        ],
      },
    });
  }

  private async handleDeliveryType(ctx: MyContext) {
    ctx.session.orderType = 'Yetkazib berish';
    ctx.session.lastAction = 'waiting_location';

    await ctx.answerCallbackQuery();
    await ctx.editMessageText('📍 *Yetkazib berish tanlandi*', {
      parse_mode: 'Markdown',
    });

    await ctx.reply(
      'Manzilni yuborish uchun *Lokatsiyani yuborish* tugmasini bosing yoki manzilni *matn ko\'rinishida yozib yuboring*:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '📍 Lokatsiyani yuborish', request_location: true }],
            [{ text: '🔙 Bekor qilish' }],
          ],
          resize_keyboard: true,
        },
      },
    );
  }

  private async handlePickupType(ctx: MyContext) {
    ctx.session.orderType = 'Olib ketish';
    ctx.session.location = null;
    ctx.session.addressText = 'Filialdan olib ketish';
    ctx.session.lastAction = 'menu';

    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🛍 *Olib ketish tanlandi*', {
      parse_mode: 'Markdown',
    });

    await ctx.reply(
      '✅ Manzil: Chartak sh., Alisher Navoiy ko\'chasi.\n\nMenudan buyurtma bering 👇',
      {
        reply_markup: {
          keyboard: [
            [{ text: '🍴 Menyu', web_app: { url: this.WEB_APP_URL } }, { text: '🛒 Savat' }],
            [{ text: '🔄 Qayta boshlash' }, { text: '📞 Aloqa' }],
          ],
          resize_keyboard: true,
         
        },
      },
    );
  }

  private async handleLocation(ctx: MyContext) {
    if (ctx.session.lastAction !== 'waiting_location') return;
    if (!ctx.message?.location) return;

    ctx.session.location = {
      latitude: ctx.message.location.latitude,
      longitude: ctx.message.location.longitude,
    };
    ctx.session.addressText = 'Xaritadagi lokatsiya yuborildi';
    ctx.session.lastAction = 'menu';

    await ctx.reply('✅ Manzil qabul qilindi!\n\nMenudan buyurtma bering 👇', {
      reply_markup: {
        keyboard: [
          [{ text: '🍴 Menyu', web_app: { url: this.WEB_APP_URL } }, { text: '🛒 Savat' }],
          [{ text: '🔄 Qayta boshlash' }, { text: '📞 Aloqa' }],
        ],
        resize_keyboard: true,
        
      },
    });
  }

  private async handleWebAppData(ctx: MyContext) {
    if (!ctx.message?.web_app_data?.data) return;

    const orderItems = JSON.parse(ctx.message.web_app_data.data);

    if (!orderItems || orderItems.length === 0) {
      await ctx.reply('❌ Buyurtma bo\'sh!');
      return;
    }

    if (!ctx.session.phone) {
      await ctx.reply('❌ Avval raqam yuboring! /start');
      return;
    }

    let orderSummary = '🚀 *Mini App-dan yangi buyurtma!*\n\n';
    orderSummary += `👤 *Mijoz:* ${ctx.from.first_name}\n`;
    orderSummary += `📞 *Telefon:* ${ctx.session.phone}\n`;
    orderSummary += `🚚 *Turi:* ${ctx.session.orderType || 'Tanlanmagan'}\n`;
    orderSummary += `📍 *Manzil:* ${ctx.session.addressText || 'Ko\'rsatilmagan'}\n\n`;

    let totalPrice = 0;
    orderItems.forEach((item: any, index: number) => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;
      orderSummary += `${index + 1}. ${item.name} | ${item.quantity} ta = ${itemTotal.toLocaleString()} so'm\n`;
    });
    orderSummary += `\n💰 *JAMI: ${totalPrice.toLocaleString()} so'm*`;

    // Admin'ga yuborish
    await this.bot.api.sendMessage(this.ADMIN_ID, orderSummary, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Qabul qilish', callback_data: `accept_${ctx.from.id}_${totalPrice}` },
            { text: '❌ Rad etish', callback_data: `reject_${ctx.from.id}` },
          ],
          [{ text: '📞 Aloqa', callback_data: `contact_${ctx.from.id}` }],
        ],
      },
    });

    if (ctx.session.location) {
      await this.bot.api.sendLocation(
        this.ADMIN_ID,
        ctx.session.location.latitude,
        ctx.session.location.longitude,
      );
    }

    await ctx.reply(`✅ *Buyurtmangiz yuborildi!*\n💰 Jami: ${totalPrice.toLocaleString()} so'm`, {
      parse_mode: 'Markdown',
    });
  }

  private async handleText(ctx: MyContext) {
    const text = ctx.message?.text;
    if (!text) return;

    // Manzil matn sifatida
    if (ctx.session.lastAction === 'waiting_location' && text !== '🔙 Bekor qilish') {
      ctx.session.addressText = text;
      ctx.session.location = null;
      ctx.session.lastAction = 'menu';

      await ctx.reply(`✅ Manzil qabul qilindi: *${text}*\n\nMenudan buyurtma bering 👇`, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '🍴 Menyu', web_app: { url: this.WEB_APP_URL } }, { text: '🛒 Savat' }],
            [{ text: '🔄 Qayta boshlash' }, { text: '📞 Aloqa' }],
          ],
          resize_keyboard: true,
          
        },
      });
      return;
    }

    // Tugmalar
    if (text === '🛒 Savat') {
      await this.showCart(ctx);
    } else if (text === '🔄 Qayta boshlash' || text === '🔙 Bekor qilish') {
      await this.handleStart(ctx);
    } else if (text === '📞 Aloqa') {
      await ctx.reply('☎️ +998 94 677 75 90\n📍 Chartak sh., Alisher Navoiy ko\'chasi');
    }
  }

  private async handleAcceptOrder(ctx: MyContext) {
    const match = ctx.match;
    if (!match) return;

    const userId = match[1];
    const price = match[2];

    await ctx.answerCallbackQuery('✅ Tasdiqlandi');
    await this.bot.api.sendMessage(
      userId,
      `✅ *Sizning buyurtmangiz qabul qilindi!*\n💰 Summa: ${parseInt(price).toLocaleString()} so'm\n⏰ Tez orada yetkazamiz.`,
      { parse_mode: 'Markdown' },
    );

    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(
        (ctx.callbackQuery.message as any).text + '\n\n✅ *STATUS: QABUL QILINDI*',
        { parse_mode: 'Markdown' },
      );
    }
  }

  private async handleRejectOrder(ctx: MyContext) {
    const match = ctx.match;
    if (!match) return;

    const userId = match[1];

    await ctx.answerCallbackQuery('❌ Rad etildi');
    await this.bot.api.sendMessage(userId, '❌ *Kechirasiz, buyurtmangiz rad etildi.*', {
      parse_mode: 'Markdown',
    });

    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(
        (ctx.callbackQuery.message as any).text + '\n\n❌ *STATUS: RAD ETILDI*',
        { parse_mode: 'Markdown' },
      );
    }
  }

  private async handleContactAdmin(ctx: MyContext) {
    const match = ctx.match;
    if (!match) return;

    const user = await this.prisma.user.findUnique({
      where: { telegramId: match[1] },
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(`📞 Mijoz: ${user?.phone || 'Noma\'lum'}`);
  }

  private async showCart(ctx: MyContext) {
    if (!ctx.session.cart?.length) {
      await ctx.reply('🛒 Savatingiz bo\'sh.');
      return;
    }

    let total = 0;
    let text = '🛒 *Savatingiz:*\n\n';
    ctx.session.cart.forEach((p: any, i: number) => {
      text += `${i + 1}. ${p.name} - ${p.price.toLocaleString()} so'm\n`;
      total += p.price;
    });
    text += `\n💰 *Jami: ${total.toLocaleString()} so'm*\n\nBuyurtma berish uchun Menuga kiring.`;

    await ctx.reply(text, { parse_mode: 'Markdown' });
  }
}