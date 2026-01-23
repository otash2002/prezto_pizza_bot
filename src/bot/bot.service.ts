import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, InlineKeyboard, Keyboard, session } from 'grammy';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly prisma = new PrismaClient();
  private readonly bot = new Bot(process.env.BOT_TOKEN!);
  private readonly ADMIN_ID = process.env.ADMIN_ID!;

  async onModuleInit() {
    // 1. SESSION INITIALIZATION
    this.bot.use(session({ 
      initial: () => ({ 
        cart: [] as any[], 
        phone: '', 
        orderType: '', 
        location: null as any,
        addressText: '', // Matnli manzil uchun yangi maydon
        lastAction: 'menu' 
      }) 
    }));

    const WEB_APP_URL = "https://otash2002.github.io/prezto_pizza_bot/?v=12";

    const mainMenu = new Keyboard()
      .webApp("🍴 Menyu", WEB_APP_URL)
      .text("🛒 Savat")
      .row()
      .text("🔄 Qayta boshlash")
      .text("📞 Aloqa")
      .resized()
      .persistent();

    // ========================================
    // START COMMAND
    // ========================================
    const startAction = async (ctx: any) => {
      ctx.session.cart = [];
      ctx.session.phone = '';
      ctx.session.orderType = '';
      ctx.session.location = null;
      ctx.session.addressText = '';
      ctx.session.lastAction = 'registration';

      await this.prisma.user.updateMany({
        where: { telegramId: ctx.from.id.toString() },
        data: { phone: '' }
      });

      await ctx.reply(
        `🍕 **Presto Pizza** ga xush kelibsiz!\n\nXizmat ko'rsatishimiz uchun raqamingizni yuboring:`, 
        {
          reply_markup: new Keyboard()
            .requestContact("📞 Raqamni yuborish")
            .resized()
            .oneTime()
        }
      );
    };

    this.bot.command('start', startAction);

    // ========================================
    // REGISTRATION (CONTACT)
    // ========================================
    this.bot.on('message:contact', async (ctx: any) => {
      const phone = ctx.message.contact.phone_number;
      ctx.session.phone = phone;
      
      await this.prisma.user.upsert({
        where: { telegramId: ctx.from.id.toString() },
        update: { phone: phone },
        create: { 
          telegramId: ctx.from.id.toString(), 
          phone: phone, 
          name: ctx.from.first_name 
        }
      });
      
      const typeKeyboard = new InlineKeyboard()
        .text("🚖 Yetkazib berish", "type_delivery")
        .text("🛍 Olib ketish", "type_pickup");
      
      await ctx.reply("✅ Ro'yxatdan o'tdingiz!\n\nXizmat turini tanlang:", { reply_markup: typeKeyboard });
    });

    // ========================================
    // ORDER TYPE & LOCATION LOGIC
    // ========================================
    this.bot.callbackQuery('type_delivery', async (ctx: any) => {
      ctx.session.orderType = 'Yetkazib berish';
      ctx.session.lastAction = 'waiting_location'; // Holatni o'zgartiramiz
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("📍 **Yetkazib berish tanlandi**");
      
      await ctx.reply(
        "Manzilni yuborish uchun **Lokatsiyani yuborish** tugmasini bosing yoki manzilni **matn ko'rinishida yozib yuboring** (Kompyuterda bo'lsangiz):\n\nMasalan: *Chortoq, Navoiy ko'chasi, 15-uy*", 
        {
          parse_mode: "Markdown",
          reply_markup: new Keyboard()
            .requestLocation("📍 Lokatsiyani yuborish")
            .row()
            .text("🔙 Bekor qilish")
            .resized()
        }
      );
    });

    this.bot.callbackQuery('type_pickup', async (ctx: any) => {
      ctx.session.orderType = 'Olib ketish';
      ctx.session.location = null;
      ctx.session.addressText = 'Filialdan olib ketish';
      ctx.session.lastAction = 'menu';
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("🛍 **Olib ketish tanlandi**");
      await ctx.reply("✅ Manzil: Chartak sh., Alisher Navoiy ko'chasi.\n\nMenudan buyurtma bering 👇", { reply_markup: mainMenu });
    });

    // Lokatsiya kelganda (Telefon)
    this.bot.on('message:location', async (ctx: any) => {
      if (ctx.session.lastAction === 'waiting_location') {
        ctx.session.location = ctx.message.location;
        ctx.session.addressText = 'Xaritadagi lokatsiya yuborildi';
        ctx.session.lastAction = 'menu';
        await ctx.reply("✅ Manzil qabul qilindi!\n\nMenudan buyurtma bering 👇", { reply_markup: mainMenu });
      }
    });

    // ========================================
    // MINI APP ORDER (ADMIN NOTIFICATION)
    // ========================================
    this.bot.on('message:web_app_data', async (ctx: any) => {
      try {
        const orderItems = JSON.parse(ctx.message.web_app_data.data);
        if (!orderItems || orderItems.length === 0) return ctx.reply("❌ Buyurtma bo'sh!");
        if (!ctx.session.phone) return ctx.reply("❌ Avval raqam yuboring! /start");

        let orderSummary = "🚀 **Mini App-dan yangi buyurtma!**\n\n";
        orderSummary += `👤 **Mijoz:** ${ctx.from.first_name}\n`;
        orderSummary += `📞 **Telefon:** ${ctx.session.phone}\n`;
        orderSummary += `🚚 **Turi:** ${ctx.session.orderType || 'Tanlanmagan'}\n`;
        orderSummary += `📍 **Manzil:** ${ctx.session.addressText || 'Ko\'rsatilmagan'}\n\n`;
        
        let totalPrice = 0;
        orderItems.forEach((item: any, index: number) => {
          const itemTotal = item.price * item.quantity;
          totalPrice += itemTotal;
          orderSummary += `${index + 1}. ${item.name} | ${item.quantity} ta = ${itemTotal.toLocaleString()} so'm\n`;
        });
        orderSummary += `\n💰 **JAMI: ${totalPrice.toLocaleString()} so'm**`;

        const adminKeyboard = new InlineKeyboard()
          .text("✅ Qabul qilish", `accept_${ctx.from.id}_${totalPrice}`)
          .text("❌ Rad etish", `reject_${ctx.from.id}`)
          .row()
          .text("📞 Aloqa", `contact_${ctx.from.id}`);

        await this.bot.api.sendMessage(this.ADMIN_ID, orderSummary, { 
          parse_mode: 'Markdown', 
          reply_markup: adminKeyboard 
        });

        if (ctx.session.location) {
          await this.bot.api.sendLocation(this.ADMIN_ID, ctx.session.location.latitude, ctx.session.location.longitude);
        }

        await ctx.reply(`✅ **Buyurtmangiz yuborildi!**\n💰 Jami: ${totalPrice.toLocaleString()} so'm`, { reply_markup: mainMenu });
      } catch (e) { await ctx.reply("❌ Xatolik yuz berdi."); }
    });

    // ========================================
    // TEXT COMMANDS & MANUAL ADDRESS
    // ========================================
    this.bot.on('message:text', async (ctx: any) => {
      const text = ctx.message.text;

      // Agar lokatsiya kutayotgan bo'lsak va foydalanuvchi matn yozsa
      if (ctx.session.lastAction === 'waiting_location' && text !== "🔙 Bekor qilish") {
        ctx.session.addressText = text;
        ctx.session.location = null; // Koordinata yo'q, faqat matn
        ctx.session.lastAction = 'menu';
        await ctx.reply(`✅ Manzil qabul qilindi: *${text}*\n\nMenudan buyurtma bering 👇`, { 
          parse_mode: "Markdown",
          reply_markup: mainMenu 
        });
        return;
      }

      if (text === "🛒 Savat") {
        await this.showCart(ctx);
      } else if (text === "🔄 Qayta boshlash" || text === "🔙 Bekor qilish") {
        await startAction(ctx);
      } else if (text === "📞 Aloqa") {
        await ctx.reply("☎️ +998 94 677 75 90\n📍 Chartak sh., Alisher Navoiy ko'chasi");
      }
    });

    // Admin va boshqa callbacklar o'zgarishsiz qoladi...
    this.bot.callbackQuery(/^accept_(\d+)_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      const price = ctx.match[2];
      await ctx.answerCallbackQuery("✅ Tasdiqlandi");
      await this.bot.api.sendMessage(userId, `✅ **Sizning buyurtmangiz qabul qilindi!**\n💰 Summa: ${parseInt(price).toLocaleString()} so'm\n⏰ Tez orada yetkazamiz.`);
      await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ **STATUS: QABUL QILINDI**");
    });

    this.bot.callbackQuery(/^reject_(\d+)$/, async (ctx: any) => {
      await this.bot.api.sendMessage(ctx.match[1], "❌ **Kechirasiz, buyurtmangiz rad etildi.**");
      await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ **STATUS: RAD ETILDI**");
    });

    this.bot.callbackQuery(/^contact_(\d+)$/, async (ctx: any) => {
      const user = await this.prisma.user.findUnique({ where: { telegramId: ctx.match[1] } });
      await ctx.reply(`📞 Mijoz: ${user?.phone || 'Noma`lum'}`);
    });

    await this.bot.start();
  }

  async showCart(ctx: any) {
    if (!ctx.session.cart?.length) return ctx.reply("🛒 Savatingiz bo'sh.");
    let total = 0;
    let text = "🛒 **Savatingiz:**\n\n";
    ctx.session.cart.forEach((p: any, i: number) => {
      text += `${i + 1}. ${p.name} - ${p.price.toLocaleString()} so'm\n`;
      total += p.price;
    });
    text += `\n💰 **Jami: ${total.toLocaleString()} so'm**\n\nBuyurtma berish uchun Mini App-ga kiring.`;
    await ctx.reply(text);
  }
}