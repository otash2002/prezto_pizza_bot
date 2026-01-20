import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, InlineKeyboard, Keyboard, session } from 'grammy';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly prisma = new PrismaClient();
  private readonly bot = new Bot(process.env.BOT_TOKEN!);
  private readonly ADMIN_ID = process.env.ADMIN_ID!;

  async onModuleInit() {
    this.bot.use(session({ 
      initial: () => ({ cart: [] as any[], phone: '', orderType: '', location: null as any }) 
    }));

    const mainMenu = new Keyboard()
      .text("🍴 Menyu").text("🛒 Savat").row()
      .text("🔄 Qayta boshlash").text("📞 Aloqa")
      .resized().persistent();

    const isWorkingTime = () => {
      const now = new Date();
      const uzbTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
      const hour = uzbTime.getUTCHours(); 
      return (hour >= 9 || hour < 3);
    };

    // 1. START ACTION
    const startAction = async (ctx: any) => {
      ctx.session.cart = [];
      const user = await this.prisma.user.findUnique({ where: { telegramId: ctx.from.id.toString() } });

      if (user) {
        ctx.session.phone = user.phone;
        const typeKeyboard = new InlineKeyboard()
          .text("🚖 Yetkazib berish", "type_delivery")
          .text("🛍 Olib ketish", "type_pickup");
        await ctx.reply(`🍕 **Presto Pizza** botiga xush kelibsiz, ${user.name}!\n\nIltimos, xizmat turini tanlang:`, { reply_markup: typeKeyboard });
      } else {
        await ctx.reply(`🍕 **Presto Pizza** botiga xush kelibsiz!\nRo'yxatdan o'tish uchun raqamingizni yuboring:`, {
          reply_markup: new Keyboard().requestContact("📞 Raqamni yuborish").resized().oneTime(),
        });
      }
    };

    this.bot.command('start', startAction);

    // 2. CONTACT QABUL QILISH
    this.bot.on('message:contact', async (ctx: any) => {
      const phone = ctx.message.contact.phone_number;
      ctx.session.phone = phone;
      await this.prisma.user.upsert({
        where: { telegramId: ctx.from.id.toString() },
        update: { phone: phone },
        create: { telegramId: ctx.from.id.toString(), phone: phone, name: ctx.from.first_name }
      });
      
      const typeKeyboard = new InlineKeyboard()
        .text("🚖 Yetkazib berish", "type_delivery")
        .text("🛍 Olib ketish", "type_pickup");
      await ctx.reply("✅ Ro'yxatdan o'tdingiz. Xizmat turini tanlang:", { reply_markup: typeKeyboard });
    });

    // 3. XIZMAT TURINI TANLASH
    this.bot.callbackQuery('type_delivery', async (ctx: any) => {
      ctx.session.orderType = 'Yetkazib berish';
      await ctx.editMessageText("📍 **Yetkazib berish uchun lokatsiyangizni yuboring:**");
      await ctx.reply("Pastdagi tugmani bosing 👇", {
        reply_markup: new Keyboard().requestLocation("📍 Lokatsiyani yuborish").resized().oneTime()
      });
    });

    this.bot.callbackQuery('type_pickup', async (ctx: any) => {
      ctx.session.orderType = 'Olib ketish';
      ctx.session.location = null;
      await ctx.editMessageText("🛍 **Olib ketish tanlandi.** \nManzil: Chartak sh., Alisher Navoiy ko'chasi.");
      await this.showCategories(ctx, false);
    });

    // 4. LOKATSIYANI QABUL QILISH
    this.bot.on('message:location', async (ctx: any) => {
      ctx.session.location = ctx.message.location;
      await ctx.reply("✅ Manzil qabul qilindi!", { reply_markup: mainMenu });
      await this.showCategories(ctx, false);
    });

    // 5. ASOSIY LOGIKA
    this.bot.on('message:text', async (ctx: any) => {
      if (ctx.message.text === "🍴 Menyu") await this.showCategories(ctx, false);
      else if (ctx.message.text === "🛒 Savat") await this.showCart(ctx);
      else if (ctx.message.text === "🔄 Qayta boshlash") await startAction(ctx);
      else if (ctx.message.text === "📞 Aloqa") await ctx.reply("☎️ Admin: +998 94 677 75 90");
    });

    // 6. ADMINGA BUYURTMA (LOKATSIYA BILAN)
    this.bot.callbackQuery('confirm_order', async (ctx: any) => {
      if (!isWorkingTime()) return ctx.reply("⚠️ Hozir ish vaqti emas.");
      if (ctx.session.cart.length === 0) return ctx.answerCallbackQuery("Savat bo'sh!");

      const orderInfo = ctx.session.cart.map((p: any) => `▫️ ${p.name}`).join('\n');
      const total = ctx.session.cart.reduce((sum: number, p: any) => sum + p.price, 0);
      
      const adminMsg = `🔔 **YANGI BUYURTMA!**\n\n` +
                       `👤 **Tel:** ${ctx.session.phone}\n` +
                       `🚚 **Turi:** ${ctx.session.orderType}\n` +
                       `🛒 **Tarkibi:**\n${orderInfo}\n` +
                       `💰 **Jami:** ${total.toLocaleString()} so'm`;

      // Adminga matnni yuborish
      await this.bot.api.sendMessage(this.ADMIN_ID, adminMsg, {
        reply_markup: new InlineKeyboard().text("👨‍🍳 Qabul qildim", `accept_${ctx.from.id}`)
      });

      // Agar lokatsiya bo'lsa, adminga xaritani yuborish
      if (ctx.session.location) {
        await this.bot.api.sendLocation(this.ADMIN_ID, ctx.session.location.latitude, ctx.session.location.longitude);
      }

      await ctx.editMessageText("🚀 **Buyurtmangiz yuborildi!** \nTez orada bog'lanamiz.");
      ctx.session.cart = [];
    });

    this.bot.callbackQuery(/^cat_(\d+)$/, async (ctx: any) => {
      const catId = parseInt(ctx.match[1]);
      const products = await this.prisma.product.findMany({ where: { categoryId: catId } });
      const keyboard = new InlineKeyboard();
      products.forEach(p => keyboard.text(`🍕 ${p.name} - ${p.price.toLocaleString()}`, `add_${p.id}`).row());
      keyboard.text("⬅️ Orqaga", "back_to_cats");
      await ctx.editMessageText("😋 **Taomni tanlang:**", { reply_markup: keyboard });
    });

    this.bot.callbackQuery(/^add_(\d+)$/, async (ctx: any) => {
      const product = await this.prisma.product.findUnique({ where: { id: parseInt(ctx.match[1]) } });
      if (product) { ctx.session.cart.push(product); await ctx.answerCallbackQuery(`✅ ${product.name} qo'shildi!`); }
    });

    this.bot.callbackQuery(/^accept_(\d+)$/, async (ctx: any) => {
      await this.bot.api.sendMessage(ctx.match[1], "✅ **Buyurtmangiz oshpaz tomonidan qabul qilindi!**");
      await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ **STATUS: QABUL QILINDI**");
    });

    this.bot.callbackQuery('back_to_cats', (ctx: any) => this.showCategories(ctx, true));
    this.bot.callbackQuery('clear_cart', (ctx: any) => { ctx.session.cart = []; this.showCategories(ctx, true); });

    this.bot.start();
  }

  async showCategories(ctx: any, edit: boolean = false) {
    const categories = await this.prisma.category.findMany();
    const keyboard = new InlineKeyboard();
   const emojis: any = { 
      'pizza': '🍕', 'pitsa': '🍕', 
      'burger': '🍔', 
      'lavash': '🌯', 
      'ichimlik': '🥤', 
      'doner': '🥙', 
      'hot-dog': '🌭', 'hotdog': '🌭',
      'sandwich': '🥪', 'sendvich': '🥪' // <-- SANDWICH QO'SHILDI
    };
    categories.forEach(c => {
      const emoji = emojis[c.name.toLowerCase()] || '🍴';
      keyboard.text(`${emoji} ${c.name}`, `cat_${c.id}`).row();
    });
    if (edit && ctx.callbackQuery) await ctx.editMessageText("🍽 **Kategoriyani tanlang:**", { reply_markup: keyboard });
    else await ctx.reply("🍽 **Kategoriyani tanlang:**", { reply_markup: keyboard });
  }

  async showCart(ctx: any) {
    if (!ctx.session.cart || ctx.session.cart.length === 0) return ctx.reply("🛒 Savatingiz bo'sh.");
    let total = 0;
    let text = "🛒 **Savatingiz:**\n\n";
    const keyboard = new InlineKeyboard();
    ctx.session.cart.forEach((p: any, index: number) => {
      text += `${index + 1}. ${p.name} - ${p.price.toLocaleString()}\n`;
      total += p.price;
      keyboard.text(`❌ ${p.name}`, `remove_${index}`).row();
    });
    text += `\n💰 **Jami: ${total.toLocaleString()} so'm**`;
    keyboard.text("✅ Tasdiqlash", "confirm_order").text("🗑 Tozalash", "clear_cart");
    if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
  }
}