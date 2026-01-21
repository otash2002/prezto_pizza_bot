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
      initial: () => ({ 
        cart: [] as any[], 
        phone: '', 
        orderType: '', 
        location: null as any 
      }) 
    }));

    const WEB_APP_URL = "https://otash2002.github.io/prezto_pizza_bot/?v=2";

    const mainMenu = new Keyboard()
      .webApp("🍴 Menyu", WEB_APP_URL)
      .text("🛒 Savat")
      .row()
      .text("🔄 Qayta boshlash")
      .text("📞 Aloqa")
      .resized()
      .persistent();

    const isWorkingTime = () => {
      const now = new Date();
      const uzbTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
      const hour = uzbTime.getUTCHours(); 
      return (hour >= 9 || hour < 3);
    };

    // ========================================
    // 1. START COMMAND
    // ========================================
    const startAction = async (ctx: any) => {
      ctx.session.cart = [];
      const user = await this.prisma.user.findUnique({ 
        where: { telegramId: ctx.from.id.toString() } 
      });

      if (user) {
        ctx.session.phone = user.phone;
        const typeKeyboard = new InlineKeyboard()
          .text("🚖 Yetkazib berish", "type_delivery")
          .text("🛍 Olib ketish", "type_pickup");
        
        await ctx.reply(
          `🍕 **Presto Pizza** ga xush kelibsiz, ${user.name}!\n\nXizmat turini tanlang:`, 
          { reply_markup: typeKeyboard }
        );
      } else {
        await ctx.reply(
          `🍕 **Presto Pizza** ga xush kelibsiz!\n\nRo'yxatdan o'tish uchun raqamingizni yuboring:`, 
          {
            reply_markup: new Keyboard()
              .requestContact("📞 Raqamni yuborish")
              .resized()
              .oneTime()
          }
        );
      }
    };

    this.bot.command('start', startAction);

    // ========================================
    // 2. TELEFON RAQAM QABUL QILISH
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
      
      await ctx.reply(
        "✅ Ro'yxatdan o'tdingiz!\n\nXizmat turini tanlang:", 
        { reply_markup: typeKeyboard }
      );
    });

    // ========================================
    // 3. XIZMAT TURINI TANLASH
    // ========================================
    this.bot.callbackQuery('type_delivery', async (ctx: any) => {
      ctx.session.orderType = 'Yetkazib berish';
      await ctx.answerCallbackQuery();
      
      await ctx.editMessageText("📍 **Yetkazib berish tanlandi**");
      
      await ctx.reply(
        "Manzilni yuborish uchun pastdagi tugmani bosing 👇", 
        {
          reply_markup: new Keyboard()
            .requestLocation("📍 Lokatsiyani yuborish")
            .resized()
            .oneTime()
        }
      );
    });

    this.bot.callbackQuery('type_pickup', async (ctx: any) => {
      ctx.session.orderType = 'Olib ketish';
      ctx.session.location = null;
      await ctx.answerCallbackQuery();
      
      await ctx.editMessageText("🛍 **Olib ketish tanlandi**");
      
      await ctx.reply(
        "✅ Bizning manzil: Chartak sh., Alisher Navoiy ko'chasi.\n\nMenudan buyurtma bering 👇", 
        { reply_markup: mainMenu }
      );
    });

    // ========================================
    // 4. LOKATSIYA QABUL QILISH
    // ========================================
    this.bot.on('message:location', async (ctx: any) => {
      ctx.session.location = ctx.message.location;
      
      await ctx.reply(
        "✅ Manzil qabul qilindi!\n\nEndi menudan buyurtma bering 👇", 
        { reply_markup: mainMenu }
      );
    });

    // ========================================
    // 5. MINI APP DAN BUYURTMA QABUL QILISH (ASOSIY QISM)
    // ========================================
    this.bot.on('message:web_app_data', async (ctx: any) => {
      try {
        // HTML dan kelgan ma'lumot
        const orderItems = JSON.parse(ctx.message.web_app_data.data);
        
        // Bo'sh buyurtma tekshiruvi
        if (!orderItems || orderItems.length === 0) {
          return ctx.reply("❌ Buyurtma bo'sh!");
        }

        // Telefon va xizmat turini tekshirish
        if (!ctx.session.phone) {
          return ctx.reply("❌ Avval raqamingizni yuboring!");
        }

        if (!ctx.session.orderType) {
          const typeKeyboard = new InlineKeyboard()
            .text("🚖 Yetkazib berish", "type_delivery")
            .text("🛍 Olib ketish", "type_pickup");
          
          return ctx.reply(
            "❌ Avval xizmat turini tanlang:", 
            { reply_markup: typeKeyboard }
          );
        }

        // Yetkazib berish uchun lokatsiya tekshiruvi
        if (ctx.session.orderType === 'Yetkazib berish' && !ctx.session.location) {
          return ctx.reply(
            "❌ Yetkazib berish uchun manzilni yuboring!", 
            {
              reply_markup: new Keyboard()
                .requestLocation("📍 Lokatsiyani yuborish")
                .resized()
                .oneTime()
            }
          );
        }

        // =========================================
        // BUYURTMA XABARINI TAYYORLASH
        // =========================================
        let orderSummary = "🔔 **YANGI BUYURTMA!**\n\n";
        orderSummary += `👤 **Mijoz:** ${ctx.from.first_name}\n`;
        orderSummary += `📞 **Telefon:** ${ctx.session.phone}\n`;
        orderSummary += `🚚 **Turi:** ${ctx.session.orderType}\n\n`;
        orderSummary += `📦 **Buyurtma tarkibi:**\n`;
        
        let totalPrice = 0;

        // Har bir mahsulotni qo'shish
        orderItems.forEach((item: any, index: number) => {
          const itemTotal = item.price * item.quantity;
          totalPrice += itemTotal;
          
          orderSummary += `${index + 1}. ${item.name}\n`;
          orderSummary += `   ${item.quantity} x ${item.price.toLocaleString()} = ${itemTotal.toLocaleString()} so'm\n\n`;
        });

        orderSummary += `💰 **JAMI: ${totalPrice.toLocaleString()} so'm**`;

        // =========================================
        // ADMIN GA YUBORISH
        // =========================================
        const adminKeyboard = new InlineKeyboard()
          .text("✅ Qabul qilish", `accept_${ctx.from.id}_${totalPrice}`)
          .text("❌ Rad etish", `reject_${ctx.from.id}`)
          .row()
          .text("📞 Aloqa", `contact_${ctx.from.id}`);

        await this.bot.api.sendMessage(
          this.ADMIN_ID, 
          orderSummary, 
          { reply_markup: adminKeyboard }
        );

        // Agar yetkazib berish bo'lsa, lokatsiyani ham yuborish
        if (ctx.session.location) {
          await this.bot.api.sendLocation(
            this.ADMIN_ID, 
            ctx.session.location.latitude, 
            ctx.session.location.longitude,
            {
              reply_markup: new InlineKeyboard().url(
                "📍 Xaritada ko'rish",
                `https://www.google.com/maps?q=${ctx.session.location.latitude},${ctx.session.location.longitude}`
              )
            }
          );
        }

        // =========================================
        // MIJOZGA JAVOB YUBORISH
        // =========================================
        await ctx.reply(
          `✅ **Buyurtmangiz qabul qilindi!**\n\n` +
          `💰 Jami: ${totalPrice.toLocaleString()} so'm\n\n` +
          `⏳ Operatorlarimiz tez orada siz bilan bog'lanadi.`, 
          { reply_markup: mainMenu }
        );

        // Sessionni tozalash
        ctx.session.cart = [];

      } catch (error) {
        console.error('Buyurtma qabul qilishda xatolik:', error);
        await ctx.reply("❌ Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
      }
    });

    // ========================================
    // 6. ADMIN TUGMALARI
    // ========================================
    
    // QABUL QILISH
    this.bot.callbackQuery(/^accept_(\d+)_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      const totalPrice = ctx.match[2];
      
      await ctx.answerCallbackQuery("✅ Buyurtma qabul qilindi");
      
      // Mijozga xabar yuborish
      try {
        await this.bot.api.sendMessage(
          userId,
          `✅ **Buyurtmangiz qabul qilindi!**\n\n` +
          `💰 Summa: ${parseInt(totalPrice).toLocaleString()} so'm\n` +
          `⏰ Tayyorlanish vaqti: 30-40 daqiqa\n\n` +
          `📞 Savollar bo'lsa: +998 94 677 75 90\n\n` +
          `🙏 Rahmat! Yaxshi ishtaha!`
        );
        
        // Admin xabarini yangilash
        await ctx.editMessageText(
          ctx.callbackQuery.message.text + "\n\n✅ **STATUS: QABUL QILINDI**"
        );
      } catch (error) {
        await ctx.answerCallbackQuery("❌ Xabar yuborishda xatolik", { show_alert: true });
      }
    });

    // RAD ETISH
    this.bot.callbackQuery(/^reject_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      
      await ctx.answerCallbackQuery("❌ Buyurtma rad etildi");
      
      // Mijozga xabar yuborish
      try {
        await this.bot.api.sendMessage(
          userId,
          `❌ **Kechirasiz, buyurtmangiz qabul qilinmadi.**\n\n` +
          `Sabab: Mahsulot tugagan yoki boshqa texnik muammo.\n\n` +
          `📞 Savollar uchun: +998 94 677 75 90\n\n` +
          `Yana buyurtma berishingiz mumkin 👇`
        );
        
        // Admin xabarini yangilash
        await ctx.editMessageText(
          ctx.callbackQuery.message.text + "\n\n❌ **STATUS: RAD ETILDI**"
        );
      } catch (error) {
        await ctx.answerCallbackQuery("❌ Xabar yuborishda xatolik", { show_alert: true });
      }
    });

    // ALOQA TUGMASI (to'g'ridan-to'g'ri qo'ng'iroq qilish)
    this.bot.callbackQuery(/^contact_(\d+)$/, async (ctx: any) => {
      const userId = ctx.match[1];
      
      // User ma'lumotlarini olish
      const user = await this.prisma.user.findUnique({
        where: { telegramId: userId }
      });
      
      if (user && user.phone) {
        await ctx.answerCallbackQuery();
        await ctx.reply(`📞 Mijoz raqami: ${user.phone}`);
      } else {
        await ctx.answerCallbackQuery("❌ Telefon raqam topilmadi", { show_alert: true });
      }
    });

    // ========================================
    // 7. ASOSIY MATNLI BUYRUQLAR
    // ========================================
    this.bot.on('message:text', async (ctx: any) => {
      const text = ctx.message.text;
      
      if (text === "🛒 Savat") {
        await this.showCart(ctx);
      } else if (text === "🔄 Qayta boshlash") {
        await startAction(ctx);
      } else if (text === "📞 Aloqa") {
        await ctx.reply(
          "📞 **Aloqa ma'lumotlari:**\n\n" +
          "☎️ Telefon: +998 94 677 75 90\n" +
          "📍 Manzil: Chartak sh., Alisher Navoiy ko'chasi\n" +
          "🕒 Ish vaqti: 09:00 - 03:00"
        );
      }
    });

    // ========================================
    // 8. SAVAT (eski bot uchun)
    // ========================================
    this.bot.callbackQuery('confirm_order', async (ctx: any) => {
      if (!isWorkingTime()) {
        return ctx.answerCallbackQuery("⚠️ Hozir ish vaqti emas (09:00-03:00)", { show_alert: true });
      }
      
      if (ctx.session.cart.length === 0) {
        return ctx.answerCallbackQuery("🛒 Savat bo'sh!");
      }

      // ... (eski kod) ...
    });

    // Bot ishga tushirish
    await this.bot.start();
    console.log('🤖 Bot ishga tushdi!');
  }

  // ========================================
  // YORDAMCHI FUNKSIYALAR
  // ========================================
  
  async showCart(ctx: any) {
    if (!ctx.session.cart || ctx.session.cart.length === 0) {
      return ctx.reply("🛒 Savatingiz bo'sh.\n\nMenudan buyurtma bering 👇");
    }
    
    let total = 0;
    let text = "🛒 **Savatingiz:**\n\n";
    const keyboard = new InlineKeyboard();
    
    ctx.session.cart.forEach((p: any, index: number) => {
      text += `${index + 1}. ${p.name} - ${p.price.toLocaleString()} so'm\n`;
      total += p.price;
      keyboard.text(`❌ ${p.name}`, `remove_${index}`).row();
    });
    
    text += `\n💰 **Jami: ${total.toLocaleString()} so'm**`;
    keyboard.text("✅ Tasdiqlash", "confirm_order").text("🗑 Tozalash", "clear_cart");
    
    await ctx.reply(text, { reply_markup: keyboard });
  }
}