import { getConfig } from "./env.js";
import { formatIsoDate, parseIsoDate } from "./date.js";

const EMAIL_I18N = {
  fr: {
    localeTag: "fr-CH",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "séjour parking",
    bookingLabelStudio: "séjour studio",
    subjects: {
      booking_confirmation: "confirmation de réservation",
      booking_modification: "réservation modifiée",
      booking_cancellation: "réservation annulée",
      arrival_instructions: "informations d'arrivée",
      departure_instructions: "instructions de départ",
      review_request: "Comment s'est passé votre séjour ?",
      payment_reminder: "rappel de paiement",
      payment_expired: "réservation expirée",
    },
    reviewBody: `Bonjour __FIRST_NAME__,

Merci d'avoir séjourné chez nous !

Votre avis aide les futurs voyageurs à trouver le bon emplacement, et il compte beaucoup pour notre petite entreprise familiale.

Si vous avez un instant, nous serions ravis de lire votre retour :
Laisser un avis → __REVIEW_LINK__

Belle suite de voyage à vous,
Céline et Cédric`,
    departureBody: `Bonjour __FIRST_NAME__,

J'espère que vous allez bien.

Comme votre séjour chez nous se termine demain (l'heure de départ est __CHECKOUT_CLOSE_TIME__), avant de partir, pourriez-vous vous assurer de trier les déchets recyclables (bouteilles recyclables en plastique/PET, canettes en aluminium, papier et carton) et les placer dans la boîte grise à l'extérieur.
Les restes organiques sont à mettre dans le petit conteneur vert près de la porte.
Les autres déchets doivent être mis dans le sac poubelle gris qui va dans le grand conteneur vert à l'extérieur (à côté du garage).

Si quelque chose n'est pas fonctionnel ou a été abîmé, je vous invite à nous en informer.

En partant, veuillez ouvrir la fenêtre en position oscillo-battante (inclinée), fermer la porte, et déposer la clé dans la boîte à clé sécurisée située en haut de l'escalier extérieur. La boîte est noire et fixée au mur du garage.
Le code est: __KEY_BOX_STUDIO_CODE__

Nous nous réjouissons de vous accueillir à nouveau.

Tous nos meilleurs vœux,
Céline et Cédric`,
    studioConfirmationBody: `Bonjour __FIRST_NAME__ __LAST_NAME__,

Merci pour votre réservation.

L'adresse du studio est "__STUDIO_ADDRESS__".
Vous trouverez également l'endroit en cherchant "C & C Eco Studio" sur Google Maps.

Vous trouverez la clé dans une boîte à clé sécurisée. L'emplacement exact de cette boîte et le code pour l'ouvrir vous seront envoyés le matin de votre jour d'arrivée.

Durant votre arrivée et tout votre séjour, nous restons disponibles via ce système de messagerie, ainsi que par téléphone (Cédric a WhatsApp/Signal/Telegram).

N'hésitez pas à nous contacter si vous avez la moindre question.

__MANAGE_LINK__

Nous nous réjouissons de vous accueillir.
Céline & Cédric Vonlanthen`,
    studioArrivalBody: `Bonjour __FIRST_NAME__ __LAST_NAME__,

Nous espérons que vous allez bien.

L'adresse du studio est "__STUDIO_ADDRESS__". Vous trouverez également l'endroit en cherchant "C & C Eco Studio" sur Google Maps.

Vous trouverez la clé dans la boîte à clé sécurisée en haut de l'escalier extérieur. La boîte est noire, fixée au mur du garage.
Le code est: __KEY_BOX_STUDIO_CODE__
Si vous entrez un code incorrect, faites glisser le bouton de réinitialisation (situé entre les touches C et D) et relâchez-le; puis réessayez.

La porte d'entrée du studio est celle de droite. Vous pouvez vous garer juste devant l'entrée.

La terrasse située devant est la vôtre. Vous pouvez prendre du bois pour allumer un barbecue sur le brasero mis à disposition si vous le souhaitez.

Sur le côté gauche de l'entrée, vous trouverez une grande boîte grise pour les matériaux recyclables. Il y a un compartiment pour les bouteilles PET (uniquement les bouteilles plastiques recyclables), un pour les canettes en aluminium et un autre pour les bouteilles en verre. Le reste de la boîte est destiné au papier et au carton secs.

Juste devant l'entrée, vous trouverez également un petit récipient vert destiné aux restes alimentaires. Tout le reste est à mettre dans le sac poubelle gris qui se trouve dans la cuisine.

Sous le four, vous trouverez des planches à découper et des maniques.

Merci d'aérer le logement régulièrement, au moins deux fois par jour pendant 10 minutes.
Vous pouvez le faire en ouvrant la fenêtre et en allumant la lumière des toilettes en même temps (cela active le ventilateur de la douche).
Lorsque vous utilisez le sèche-linge, veuillez laisser la lumière des toilettes allumée pour que le ventilateur continue de fonctionner.

Un déshumidificateur est également disponible dans la salle de bain, à utiliser après une douche, pendant l'utilisation du sèche-linge ou lorsque le taux d'humidité devient trop élevé (> 60 %). Lorsque l'indicateur affiche "bac plein", ouvrez le bac et videz l'eau dans la douche.

Pour accéder aux plus de 250 chaînes TV gratuites, vous devez utiliser l'application "Salt.TV" sur l'Apple TV.

Vous pouvez également recharger votre voiture électrique si vous en avez une, lorsque nous sommes sur place.
Nous fournissons un câble de recharge compatible avec la prise suisse Type 13 (220 V, 10 A) équipé d'un connecteur Type 2 (standard pour la plupart des véhicules électriques). Ce service de recharge lente est disponible moyennant un supplément (CHF 15 pour 10h, CHF 30 pour toute la journée ou la nuit).

Durant votre arrivée et tout au long de votre séjour, nous restons disponibles via ce système de messagerie, ainsi que par téléphone (Cédric a WhatsApp, Signal et Telegram).

Nous vous souhaitons un agréable séjour.

Bien cordialement,
Céline et Cédric`,
    greeting: (name) => `Bonjour ${name},`,
    confirmationCreated: (label) => `Merci. Votre réservation ${label} a bien été créée.`,
    referenceLabel: "Référence",
    arrivalLabel: "Arrivée",
    departureLabel: "Départ",
    totalLabel: "Total",
    between: "entre",
    and: "et",
    by: "avant",
    paymentPendingNotice:
      "Si le paiement n'a pas encore été finalisé, merci d'utiliser le lien de paiement affiché après la réservation ou de nous contacter si besoin.",
    paymentReminderIntro:
      "Nous réservons vos dates ({dates}) mais le paiement est toujours en attente.",
    paymentReminderDeadline:
      "Merci de finaliser le paiement dès que possible ; vos dates pourraient sinon être libérées et réservées par quelqu'un d'autre.",
    paymentExpiredIntro:
      "Le paiement de la réservation {reference} n'a pas été finalisé à temps et les dates ({dates}) ont été libérées.",
    paymentExpiredReopen:
      "Vous pouvez encore finaliser le paiement depuis votre lien de gestion si les dates sont toujours disponibles ; sinon, nous serons ravis de vous aider à trouver de nouvelles dates.",
    indoorAccessNotice:
      "L'accès au WC et à la douche intérieure est disponible sur demande, uniquement lorsque nous sommes sur place, entre 7h00 et 21h00.",
    indoorAccessUpsell:
      "Ce service optionnel est proposé au tarif de CHF 10 pour les 7 premières nuits, puis CHF 10 par semaine supplémentaire.",
    manageReservation: "Gérer votre réservation",
    supportLine:
      `Cédric reste disponible si nécessaire via cette messagerie ou WhatsApp __WHATSAPP_LINE__ (messages uniquement)`,
    confirmationClose: "Nous nous réjouissons de vous accueillir.",
    confirmationSignoff: "À bientôt,",
    arrivalStudioIntro: "Nous nous réjouissons de vous accueillir.",
    arrivalAssistance:
      `Si vous avez besoin d'aide avant votre arrivée, Cédric reste disponible via cette messagerie ou WhatsApp __WHATSAPP_LINE__ (messages uniquement)`,
    kindRegards: "Bien cordialement,",
    updatedReservation: "Votre réservation a été mise à jour.",
    updatedTotalLabel: "Nouveau total",
    additionalPayment: (amount) =>
      `Un paiement complémentaire de ${amount} est nécessaire pour confirmer cette modification.`,
    refundDue: (amount) =>
      `Un remboursement de ${amount} est dû suite à votre modification.`,
    noChangeAmount: "Cette modification ne change pas le montant total.",
    cancelledReservation: "Votre réservation a été annulée.",
    cancelledOnLabel: "Annulée le",
    refundManual: "Si un remboursement est dû, nous le traiterons manuellement dès que possible.",
    parkingArrivalIntro: "Nous espérons que vous allez bien.",
    arrivalParkingLines: [
      'Vous pouvez trouver l’emplacement en recherchant "C&C motorhome/RV/van/camping-car parking space" dans Google Maps.',
      "À votre arrivée, vous pouvez stationner votre véhicule juste devant le garage.",
      "La terrasse située au-dessus du garage est pour vous.",
      "Des coussins rouges sont à disposition sur les palettes en bois de la terrasse. Vous les trouverez dans le garage. Merci de les remettre dans le garage avant la nuit ou en cas de pluie.",
      "__GARAGE_INSTRUCTIONS__",
      'Pour le Wi-Fi devant le garage, le réseau est "candc-studio". Le mot de passe est "__WIFI_STUDIO_PASSWORD__".',
      'Sur la terrasse, le meilleur réseau est "candc".',
      "Voici le mot de passe :",
      "__WIFI_TERRACE_PASSWORD__",
      "Vous trouverez un câble électrique avec une prise suisse normale 220 V (3 broches) sous la porte du garage, ou à l’intérieur du garage, sur le côté droit, à environ 1 m de hauteur.",
      "Le robinet d’eau est visible près de la grande boîte grise, dans l’angle.",
      "Nous ne disposons PAS d’infrastructure pour les eaux noires (eaux usées des toilettes). Il faudra vous rendre dans un camping voisin pour cela.",
      "Vous pouvez prendre un peu de bois pour démarrer un barbecue sur le brasero, mis à disposition si vous le souhaitez.",
      "Sur le côté gauche de l’entrée, vous trouverez une grande boîte grise pour les matériaux recyclables. Des compartiments séparés sont prévus pour les bouteilles PET, les canettes en aluminium et les bouteilles en verre. Le reste de la boîte est destiné au papier et au carton secs.",
      "Vous trouverez également un petit récipient vert pour les restes alimentaires. Tout le reste doit être mis dans un sac poubelle à déposer dans le grand container vert.",
    ],
    arrivalWcIncluded:
      "L’accès au WC et à la douche intérieure a été ajouté à votre séjour. Il est disponible sur demande lorsque nous sommes sur place, généralement entre 7h00 et 21h00.",
    arrivalWcUpsell:
      "L’accès au WC et à la douche intérieure est disponible sur demande entre 7h00 et 21h00 lorsque nous sommes sur place. Ce service optionnel est proposé au tarif de CHF 10 pour les 7 premières nuits, puis CHF 10 par semaine supplémentaire. Merci de nous contacter pour vérifier la disponibilité.",
    arrivalEvCharge:
      "Vous pouvez aussi recharger votre voiture électrique si besoin, lorsque nous sommes sur place. Nous fournissons un câble compatible avec la prise suisse Type 13 (220 V, 10 A) équipé d’un connecteur Type 2. Ce service de recharge lente est proposé en supplément (CHF 15 pour 10h, CHF 30 pour toute la journée ou la nuit).",
    arrivalSupport:
      `À votre arrivée et pendant tout votre séjour, Cédric sera disponible via cette messagerie ou WhatsApp __WHATSAPP_LINE__`,
    pleasantStay: "Nous vous souhaitons un excellent séjour.",
  },
  en: {
    localeTag: "en-CH",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "parking stay",
    bookingLabelStudio: "studio stay",
    subjects: {
      booking_confirmation: "booking confirmation",
      booking_modification: "booking updated",
      booking_cancellation: "booking cancelled",
      arrival_instructions: "arrival information",
      departure_instructions: "departure information",
      review_request: "How was your stay at C&C?",
      payment_reminder: "payment reminder",
      payment_expired: "reservation expired",
    },
    reviewBody: `Hello __FIRST_NAME__,

Thank you for staying with us!

Your feedback helps future travellers find the right spot, and it means a lot to our small family business.

If you have a moment, we'd love to hear about your stay:
Leave us a review → __REVIEW_LINK__

Wishing you a great onward journey,
Celine and Cedric`,
    departureBody: `Hello __FIRST_NAME__,

I hope you are well.

As your stay with us ends tomorrow (check-out time is __CHECKOUT_CLOSE_TIME__), before you leave, please make sure to sort the recyclable waste (recyclable plastic/PET bottles, aluminum cans, paper and cardboard) and place them in the grey box outside.
The organic remains go in the small green container near the door.
The other trash goes in the gray trash-bag that goes inside the big green container outside (alongside the garage).

If anything is not working or has been damaged, please notify us.

When leaving, please open the window in the tilt-and-turn position (tilted), close the door, and place the key in the secure key box located at the top of the external staircase. The box is black and attached to the garage wall.
The code is: __KEY_BOX_STUDIO_CODE__

We look forward to welcoming you back.

All the best,
Celine and Cedric`,
    studioConfirmationBody: `Dear __FIRST_NAME__ __LAST_NAME__,

Thank you for your booking.

The studio address is "__STUDIO_ADDRESS__".
You will also find the place by searching "C & C Eco Studio" on Google Maps.

You will find the key in a secure key box. The exact location of this box and the code to open it will be sent to you the morning of your day of arrival.

During your arrival and your whole stay, we will remain available through this messaging system, as well as by phone (Cedric has WhatsApp/Signal/Telegram installed).

Please let us know if you have any question.

__MANAGE_LINK__

We look forward meeting you.
Céline & Cédric Vonlanthen`,
    studioArrivalBody: `Dear __FIRST_NAME__ __LAST_NAME__,

We hope you are well.

The studio address is "__STUDIO_ADDRESS__". You will also find the place by searching "C & C Eco Studio" on Google Maps.

You will find the key in the secure key box at the top of the outside stairs. The box is black, fixed to the wall of the garage.
The code is: __KEY_BOX_STUDIO_CODE__
If you enter the wrong code, slide the reset button (located between the C and D keys) and release it; then, try again.

The studio's entry door is the one on the right side. You can park your car just in front of the entry.

The terrace on the front is yours. You can take some woods to start a barbecue on the brasero which is provided if you wish.

On the left side of the entry, you will find a big gray box. This is for recyclable materials. There is one for PET bottles (not for all the plastics, only the recyclable plastic bottles), one for aluminum cans and another for glass bottles. The rest of the box is for dry paper and cardboard.

Just in front of the entry, you will also find a small green recipient which is for food leftovers. Everything else goes into the grey trash-bag which is in the kitchen.

Under the oven, you will find some cutting boards and oven mitts.

Please air the flat regularly, at least twice a day for 10 minutes.
You can do this by opening the window and turning on the toilet light at the same time (this will turn on the shower fan).
When using the tumble dryer, please leave the toilet light on so that it keeps the fan running.

A dehumidifier is also available in the bathroom, for use after a shower, when using the tumble dryer, or when humidity levels rise too high (> 60%). When the indicator shows "tray full", open the tray and empty the water into the shower.

To access the more than 250 free TV channels, you will need to use the "Salt.TV" application on the Apple TV.

You can also charge your electric car if you have one, and we are on-site.
We supply a charging cable compatible with the Type 13 socket (Swiss domestic: 220 V, 10 A) and fitted with a Type 2 connector (standard for most electric vehicles). This slow recharging service is available at an additional charge (CHF 15 for 10h, CHF 30 for the whole day or night).

During your arrival and throughout your stay, we will remain available through this messaging system, as well as by phone (Cedric has WhatsApp, Signal, and Telegram installed).

We wish you a pleasant stay.

Kind Regards,
Celine and Cedric`,    greeting: (name) => `Dear ${name},`,
    confirmationCreated: (label) => `Thank you. Your ${label} reservation has been created.`,
    referenceLabel: "Reference",
    arrivalLabel: "Arrival",
    departureLabel: "Departure",
    totalLabel: "Total",
    between: "between",
    and: "and",
    by: "by",
    paymentPendingNotice:
      "If payment has not been completed yet, please use the payment link shown after booking or contact us if needed.",
    paymentReminderIntro:
      "We are holding your dates ({dates}) for you, but the payment is still pending.",
    paymentReminderDeadline:
      "Please complete the payment as soon as possible, otherwise your dates may be released and booked by someone else.",
    paymentExpiredIntro:
      "The payment for reservation {reference} was not completed in time, and the dates ({dates}) have been released.",
    paymentExpiredReopen:
      "You can still complete the payment from your management link if the dates are still available; otherwise we would be happy to help you find new dates.",
    indoorAccessNotice:
      "Access to an indoor toilet and shower is available on request, only when we are on site, between 7 a.m. and 9 p.m.",
    indoorAccessUpsell:
      "This optional service costs CHF 10 for the first 7 nights, then CHF 10 per additional week.",
    manageReservation: "Manage your reservation",
    supportLine:
      `Cédric is available if needed via this messaging system or via WhatsApp __WHATSAPP_LINE__ (messages only)`,
    confirmationClose: "We look forward to meeting you.",
    confirmationSignoff: "See you soon,",
    arrivalStudioIntro: "We are looking forward to welcoming you.",
    arrivalAssistance:
      `If you need assistance before arrival, Cédric is available via this messaging system or via WhatsApp __WHATSAPP_LINE__ (messages only)`,
    kindRegards: "Kind regards,",
    updatedReservation: "Your reservation has been updated.",
    updatedTotalLabel: "Updated total",
    additionalPayment: (amount) =>
      `An additional payment of ${amount} is required to confirm the change.`,
    refundDue: (amount) =>
      `A refund of ${amount} is due following your change.`,
    noChangeAmount: "The modification does not change the total amount.",
    cancelledReservation: "Your reservation has been cancelled.",
    cancelledOnLabel: "Cancelled on",
    refundManual: "If a refund is due, we will process it manually as soon as possible.",
    parkingArrivalIntro: "We hope you are well.",
    arrivalParkingLines: [
      'You can find the place by searching for "C&C motorhome/RV/van/camping-car parking space" in Google Maps.',
      "When you arrive, you can park your vehicle just in front of the garage.",
      "The terrace on top of the garage is for you.",
      "Red cushions are available for use on the wooden pallets of the terrace. You can find them in the garage. They should be stored back in the garage before nightfall or in case of rain.",
      "__GARAGE_INSTRUCTIONS__",
      'For the Wi-Fi in front of the garage, use the "candc-studio" network. The password is "__WIFI_STUDIO_PASSWORD__".',
      'On the terrace, the best network is "candc".',
      "Here is the password:",
      "__WIFI_TERRACE_PASSWORD__",
      "You'll find an electric cable with a normal 220 V Swiss plug (3 pins) under the garage door, or on the right-hand side inside the garage, about 1 m high.",
      "The water tap is visible near the big gray box, in the corner.",
      "We do NOT have the infrastructure for blackwater (wastewater from the toilet system). You will need to go to a nearby campsite for that.",
      "You can take some wood to start a barbecue on the brasero, which is provided if you wish.",
      "On the left side of the entry, you will find a big gray box for recyclable materials. There are separate options for PET bottles, aluminum cans and glass bottles. The rest of the box is for dry paper and cardboard.",
      "You will also find a small green receptacle for food remains. Everything else goes into a trash bag, which needs to be put in the big green container.",
    ],
    arrivalWcIncluded:
      "Indoor toilet and shower access has been added to your stay. It is available on request when we are on site, usually between 7 a.m. and 9 p.m.",
    arrivalWcUpsell:
      "Access to an indoor toilet and shower is available on request between 7 a.m. and 9 p.m. when we are on site. This optional service costs CHF 10 for the first 7 nights, then CHF 10 per additional week. Please contact us to check availability.",
    arrivalEvCharge:
      "You can also charge your electric car if you have one, and we are on site. We supply a charging cable compatible with the Type 13 socket (Swiss domestic: 220 V, 10 A) and fitted with a Type 2 connector. This slow recharging service is available at an additional charge (CHF 15 for 10h, CHF 30 for the whole day or night).",
    arrivalSupport:
      `Upon your arrival and throughout your stay, Cédric will be available to assist you via this messaging system or via WhatsApp __WHATSAPP_LINE__`,
    pleasantStay: "We wish you a pleasant stay.",
  },
  de: {
    localeTag: "de-CH",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "Parkplatzaufenthalt",
    bookingLabelStudio: "Studioaufenthalt",
    subjects: {
      booking_confirmation: "Buchungsbestätigung",
      booking_modification: "Buchung aktualisiert",
      booking_cancellation: "Buchung storniert",
      arrival_instructions: "Anreiseinformationen",
      departure_instructions: "Abreiseinformationen",
      review_request: "Wie war Ihr Aufenthalt bei C&C?",
      payment_reminder: "Zahlungserinnerung",
      payment_expired: "Reservierung abgelaufen",
    },
    reviewBody: `Guten Tag __FIRST_NAME__,

Vielen Dank für Ihren Aufenthalt bei uns!

Ihre Bewertung hilft zukünftigen Reisenden, den richtigen Platz zu finden, und bedeutet unserer kleinen Familienunternehmung sehr viel.

Wenn Sie einen Moment Zeit haben, würden wir uns sehr über Ihr Feedback freuen:
Hinterlassen Sie eine Bewertung → __REVIEW_LINK__

Eine schöne Weiterreise wünschen
Céline und Cédric`,
    departureBody: `Guten Tag __FIRST_NAME__,

Wir hoffen, es geht Ihnen gut.

Da Ihr Aufenthalt bei uns morgen endet (Check-Out-Zeit ist __CHECKOUT_CLOSE_TIME__), könnten Sie bitte vor Ihrer Abreise dafür sorgen, dass die wiederverwertbaren Abfälle (wiederverwertbare Plastik-/PET-Flaschen, Aluminiumdosen, Papier und Pappe) sortiert und in die graue Box draußen gegeben werden.
Die organischen Reste gehören in den kleinen grünen Container neben der Tür.
Die anderen Abfälle gehören in den grauen Müllsack, der in den großen grünen Container draußen (neben der Garage) kommt.

Falls etwas nicht funktioniert oder beschädigt wurde, bitte ich Sie, uns dies mitzuteilen.

Wenn Sie gehen, öffnen Sie bitte das Fenster in Kippstellung, schließen Sie die Tür und legen Sie den Schlüssel in den sicheren Schlüsselkasten oben an der Außentreppe. Der Kasten ist schwarz und an der Wand der Garage befestigt.
Der Code lautet: __KEY_BOX_STUDIO_CODE__

Wir freuen uns darauf, Sie wieder begrüßen zu dürfen.

Alles Gute für Sie,
Celine und Cedric`,
    studioConfirmationBody: `Hallo __FIRST_NAME__ __LAST_NAME__,

Vielen Dank für Ihre Buchung.

Die Adresse des Studios lautet "__STUDIO_ADDRESS__".
Sie finden den Ort auch, indem Sie in Google Maps nach "C & C Eco Studio" suchen.

Den Schlüssel finden Sie in einem sicheren Schlüsselkasten. Der genaue Standort dieses Kastens und der Code zum Öffnen werden Ihnen am Morgen Ihres Anreisetages zugesandt.

Während Ihrer Anreise und Ihres gesamten Aufenthalts bleiben wir über dieses Nachrichtensystem sowie telefonisch erreichbar (Cédric hat WhatsApp/Signal/Telegram).

Bitte lassen Sie es uns wissen, wenn Sie Fragen haben.

__MANAGE_LINK__

Wir freuen uns darauf, Sie willkommen zu heissen.
Céline & Cédric Vonlanthen`,
    studioArrivalBody: `Hallo __FIRST_NAME__ __LAST_NAME__,

Wir hoffen, es geht Ihnen gut.

Die Adresse des Studios lautet "__STUDIO_ADDRESS__". Sie finden den Ort auch, indem Sie in Google Maps nach "C & C Eco Studio" suchen.

Den Schlüssel finden Sie im sicheren Schlüsselkasten oben an der Außentreppe. Der Kasten ist schwarz und an der Wand der Garage befestigt.
Der Code lautet: __KEY_BOX_STUDIO_CODE__
Wenn Sie einen falschen Code eingeben, schieben Sie den Reset-Knopf (zwischen den Tasten C und D) und lassen Sie ihn los; versuchen Sie es dann erneut.

Die Eingangstür des Studios ist die rechte. Sie können Ihr Auto direkt vor dem Eingang parken.

Die vordere Terrasse gehört Ihnen. Sie können etwas Holz nehmen, um auf dem bereitgestellten Brasero ein Grillfeuer zu entfachen.

Auf der linken Seite des Eingangs finden Sie eine große graue Box für Recyclingmaterial. Es gibt ein Fach für PET-Flaschen (nur recycelbare Plastikflaschen), eines für Aluminiumdosen und ein weiteres für Glasflaschen. Der Rest der Box ist für trockenes Papier und Karton.

Direkt vor dem Eingang finden Sie auch einen kleinen grünen Behälter für Essensreste. Alles andere kommt in den grauen Müllsack, der in der Küche zu finden ist.

Unter dem Ofen finden Sie Schneidebretter und Ofenhandschuhe.

Bitte lüften Sie das Studio regelmäßig, mindestens zweimal täglich für 10 Minuten.
Sie können dies tun, indem Sie das Fenster öffnen und gleichzeitig das Toilettenlicht einschalten (dies aktiviert den Duschventilator).
Lassen Sie beim Betrieb des Wäschetrockners bitte das Toilettenlicht eingeschaltet, damit der Ventilator weiterläuft.

Ein Luftentfeuchter steht Ihnen ebenfalls im Badezimmer zur Verfügung, zur Nutzung nach dem Duschen, beim Betrieb des Wäschetrockners oder wenn die Luftfeuchtigkeit zu hoch steigt (> 60 %). Wenn die Anzeige "Behälter voll" anzeigt, öffnen Sie den Behälter und leeren Sie das Wasser in die Dusche.

Um auf die mehr als 250 kostenlosen TV-Sender zuzugreifen, verwenden Sie bitte die "Salt.TV"-App auf dem Apple TV.

Sie können Ihr Elektroauto auch aufladen, falls Sie eines haben und wir vor Ort sind.
Wir stellen ein Ladekabel zur Verfügung, das mit der Schweizer Typ-13-Steckdose (220 V, 10 A) kompatibel und mit einem Typ-2-Stecker ausgestattet ist (Standard für die meisten Elektrofahrzeuge). Dieser Langsam-Ladeservice ist gegen Aufpreis verfügbar (CHF 15 für 10h, CHF 30 für den ganzen Tag oder die ganze Nacht).

Während Ihrer Anreise und Ihres gesamten Aufenthalts bleiben wir über dieses Nachrichtensystem sowie telefonisch erreichbar (Cédric hat WhatsApp, Signal und Telegram).

Wir wünschen Ihnen einen angenehmen Aufenthalt.

Freundliche Grüsse,
Céline und Cédric`,    greeting: (name) => `Hallo ${name},`,
    confirmationCreated: (label) => `Vielen Dank. Ihre Reservierung für den ${label} wurde erstellt.`,
    referenceLabel: "Referenz",
    arrivalLabel: "Anreise",
    departureLabel: "Abreise",
    totalLabel: "Gesamtbetrag",
    between: "zwischen",
    and: "und",
    by: "bis",
    paymentPendingNotice:
      "Falls die Zahlung noch nicht abgeschlossen wurde, verwenden Sie bitte den nach der Buchung angezeigten Zahlungslink oder kontaktieren Sie uns bei Bedarf.",
    paymentReminderIntro:
      "Wir halten Ihre Daten ({dates}) für Sie reserviert, aber die Zahlung ist noch ausstehend.",
    paymentReminderDeadline:
      "Bitte schliessen Sie die Zahlung so bald wie möglich ab, sonst könnten Ihre Daten freigegeben und von jemand anderem gebucht werden.",
    paymentExpiredIntro:
      "Die Zahlung für die Reservierung {reference} wurde nicht rechtzeitig abgeschlossen und die Daten ({dates}) wurden freigegeben.",
    paymentExpiredReopen:
      "Sie können die Zahlung über Ihren Verwaltungslink noch abschliessen, falls die Daten verfügbar sind; andernfalls helfen wir Ihnen gerne, neue Daten zu finden.",
    indoorAccessNotice:
      "Der Zugang zu Innen-WC und Dusche ist auf Anfrage möglich, nur wenn wir vor Ort sind, zwischen 7:00 und 21:00 Uhr.",
    indoorAccessUpsell:
      "Dieser optionale Service kostet CHF 10 für die ersten 7 Nächte, danach CHF 10 pro zusätzlicher Woche.",
    manageReservation: "Reservierung verwalten",
    supportLine:
      `Cédric ist bei Bedarf über dieses Nachrichtensystem oder per WhatsApp erreichbar: __WHATSAPP_LINE__ (nur Nachrichten)`,
    confirmationClose: "Wir freuen uns darauf, Sie willkommen zu heissen.",
    confirmationSignoff: "Bis bald,",
    arrivalStudioIntro: "Wir freuen uns darauf, Sie willkommen zu heissen.",
    arrivalAssistance:
      `Wenn Sie vor Ihrer Anreise Hilfe benötigen, ist Cédric über dieses Nachrichtensystem oder per WhatsApp erreichbar: __WHATSAPP_LINE__ (nur Nachrichten)`,
    kindRegards: "Freundliche Grüsse,",
    updatedReservation: "Ihre Reservierung wurde aktualisiert.",
    updatedTotalLabel: "Neuer Gesamtbetrag",
    additionalPayment: (amount) =>
      `Eine zusätzliche Zahlung von ${amount} ist erforderlich, um diese Änderung zu bestätigen.`,
    refundDue: (amount) =>
      `Aufgrund Ihrer Änderung ist eine Rückerstattung von ${amount} fällig.`,
    noChangeAmount: "Diese Änderung verändert den Gesamtbetrag nicht.",
    cancelledReservation: "Ihre Reservierung wurde storniert.",
    cancelledOnLabel: "Storniert am",
    refundManual: "Falls eine Rückerstattung fällig ist, bearbeiten wir sie so schnell wie möglich manuell.",
    parkingArrivalIntro: "Wir hoffen, dass es Ihnen gut geht.",
    arrivalParkingLines: [
      'Sie finden den Platz, indem Sie in Google Maps nach "C&C motorhome/RV/van/camping-car parking space" suchen.',
      "Bei Ihrer Ankunft können Sie Ihr Fahrzeug direkt vor der Garage abstellen.",
      "Die Terrasse auf dem Garagendach steht Ihnen zur Verfügung.",
      "Rote Kissen für die Holzpaletten auf der Terrasse finden Sie in der Garage. Bitte legen Sie sie vor Einbruch der Nacht oder bei Regen wieder in die Garage zurück.",
      "__GARAGE_INSTRUCTIONS__",
      'Für das WLAN vor der Garage verwenden Sie das Netzwerk "candc-studio". Das Passwort lautet "__WIFI_STUDIO_PASSWORD__".',
      'Auf der Terrasse ist das beste Netzwerk "candc".',
      "Hier ist das Passwort:",
      "__WIFI_TERRACE_PASSWORD__",
      "Ein Stromkabel mit normalem Schweizer 220-V-Stecker (3 Pins) befindet sich unter dem Garagentor oder rechts innen in der Garage auf etwa 1 m Höhe.",
      "Der Wasserhahn ist in der Ecke neben der grossen grauen Box sichtbar.",
      "Wir verfügen NICHT über eine Infrastruktur für Schwarzwasser (Abwasser aus dem Toilettensystem). Dafür müssen Sie einen nahegelegenen Campingplatz aufsuchen.",
      "Sie dürfen etwas Holz nehmen, um auf dem bereitgestellten Brasero ein Grillfeuer zu entfachen.",
      "Auf der linken Seite des Eingangs befindet sich eine grosse graue Box für Recyclingmaterial. Es gibt getrennte Bereiche für PET-Flaschen, Aluminiumdosen und Glasflaschen. Der Rest der Box ist für trockenes Papier und Karton vorgesehen.",
      "Sie finden auch einen kleinen grünen Behälter für Speisereste. Alles andere gehört in einen Müllsack, der in den grossen grünen Container gelegt werden muss.",
    ],
    arrivalWcIncluded:
      "Der Zugang zu Innen-WC und Dusche wurde zu Ihrem Aufenthalt hinzugefügt. Er ist auf Anfrage möglich, wenn wir vor Ort sind, in der Regel zwischen 7:00 und 21:00 Uhr.",
    arrivalWcUpsell:
      "Der Zugang zu Innen-WC und Dusche ist auf Anfrage zwischen 7:00 und 21:00 Uhr möglich, wenn wir vor Ort sind. Dieser optionale Service kostet CHF 10 für die ersten 7 Nächte, danach CHF 10 pro zusätzlicher Woche. Bitte kontaktieren Sie uns, um die Verfügbarkeit zu prüfen.",
    arrivalEvCharge:
      "Sie können auch Ihr Elektroauto aufladen, wenn wir vor Ort sind. Wir stellen ein Kabel bereit, das mit der Schweizer Typ-13-Steckdose (220 V, 10 A) kompatibel ist und über einen Typ-2-Anschluss verfügt. Dieser langsame Ladeservice ist gegen Aufpreis verfügbar (CHF 15 für 10h, CHF 30 für den ganzen Tag oder die ganze Nacht).",
    arrivalSupport:
      `Bei Ihrer Ankunft und während Ihres gesamten Aufenthalts ist Cédric über dieses Nachrichtensystem oder per WhatsApp erreichbar: __WHATSAPP_LINE__`,
    pleasantStay: "Wir wünschen Ihnen einen angenehmen Aufenthalt.",
  },
  es: {
    localeTag: "es-ES",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "estancia en el parking",
    bookingLabelStudio: "estancia en el estudio",
    subjects: {
      booking_confirmation: "confirmación de reserva",
      booking_modification: "reserva actualizada",
      booking_cancellation: "reserva cancelada",
      arrival_instructions: "información de llegada",
      departure_instructions: "información de salida",
      review_request: "¿Qué tal tu estancia en C&C?",
      payment_reminder: "recordatorio de pago",
      payment_expired: "reserva expirada",
    },
    reviewBody: `Hola __FIRST_NAME__,

¡Gracias por alojarte con nosotros!

Tu reseña ayuda a los futuros viajeros a encontrar el lugar adecuado, y significa mucho para nuestra pequeña empresa familiar.

Si tienes un momento, nos encantaría conocer tu opinión:
Deja una reseña → __REVIEW_LINK__

Que tengas un buen viaje,
Céline y Cédric`,
    greeting: (name) => `Hola ${name},`,
    confirmationCreated: (label) => `Gracias. Tu reserva de ${label} ha sido creada.`,
    referenceLabel: "Referencia",
    arrivalLabel: "Llegada",
    departureLabel: "Salida",
    totalLabel: "Total",
    between: "entre",
    and: "y",
    by: "antes de",
    paymentPendingNotice:
      "Si el pago aún no se ha completado, utiliza el enlace de pago mostrado después de la reserva o contáctanos si lo necesitas.",
    paymentReminderIntro:
      "Estamos reservando tus fechas ({dates}), pero el pago sigue pendiente.",
    paymentReminderDeadline:
      "Completa el pago lo antes posible; de lo contrario, tus fechas podrían liberarse y ser reservadas por otra persona.",
    paymentExpiredIntro:
      "El pago de la reserva {reference} no se completó a tiempo y las fechas ({dates}) se han liberado.",
    paymentExpiredReopen:
      "Aún puedes completar el pago desde tu enlace de gestión si las fechas siguen disponibles; si no, estaremos encantados de ayudarte a encontrar nuevas fechas.",
    indoorAccessNotice:
      "El acceso al WC y a la ducha interior está disponible bajo petición, solo cuando estamos en el lugar, entre las 7:00 y las 21:00.",
    indoorAccessUpsell:
      "Este servicio opcional cuesta 10 CHF por las 7 primeras noches, luego 10 CHF por semana adicional.",
    manageReservation: "Gestionar tu reserva",
    supportLine:
      `Cédric está disponible si hace falta a través de este sistema de mensajería o por WhatsApp __WHATSAPP_LINE__ (solo mensajes)`,
    confirmationClose: "Esperamos verte pronto.",
    confirmationSignoff: "Hasta pronto,",
    arrivalStudioIntro: "Estamos deseando darte la bienvenida.",
    arrivalAssistance:
      `Si necesitas ayuda antes de llegar, Cédric está disponible a través de este sistema de mensajería o por WhatsApp __WHATSAPP_LINE__ (solo mensajes)`,
    kindRegards: "Un cordial saludo,",
    updatedReservation: "Tu reserva ha sido actualizada.",
    updatedTotalLabel: "Nuevo total",
    additionalPayment: (amount) =>
      `Se requiere un pago adicional de ${amount} para confirmar este cambio.`,
    refundDue: (amount) =>
      `Se debe un reembolso de ${amount} tras tu cambio.`,
    noChangeAmount: "Este cambio no modifica el importe total.",
    cancelledReservation: "Tu reserva ha sido cancelada.",
    cancelledOnLabel: "Cancelada el",
    refundManual: "Si corresponde un reembolso, lo tramitaremos manualmente lo antes posible.",
    parkingArrivalIntro: "Esperamos que estés bien.",
    arrivalParkingLines: [
      'Puedes encontrar el lugar buscando "C&C motorhome/RV/van/camping-car parking space" en Google Maps.',
      "Cuando llegues, puedes aparcar tu vehículo justo delante del garaje.",
      "La terraza situada encima del garaje es para ti.",
      "Hay cojines rojos disponibles para usar en los palés de madera de la terraza. Los encontrarás en el garaje. Deben guardarse de nuevo en el garaje antes de la noche o en caso de lluvia.",
      "__GARAGE_INSTRUCTIONS__",
      'Para el Wi-Fi delante del garaje, usa la red "candc-studio". La contraseña es "__WIFI_STUDIO_PASSWORD__".',
      'En la terraza, la mejor red es "candc".',
      "Aquí tienes la contraseña:",
      "__WIFI_TERRACE_PASSWORD__",
      "Encontrarás un cable eléctrico con un enchufe suizo normal de 220 V (3 clavijas) debajo de la puerta del garaje, o en el lado derecho dentro del garaje, a unos 1 m de altura.",
      "El grifo de agua está visible cerca de la gran caja gris, en la esquina.",
      "NO disponemos de infraestructura para aguas negras (aguas residuales del sistema de inodoro). Tendrás que ir a un camping cercano para eso.",
      "Puedes coger algo de leña para encender una barbacoa en el brasero, que está a tu disposición si lo deseas.",
      "A la izquierda de la entrada encontrarás una gran caja gris para materiales reciclables. Hay opciones separadas para botellas PET, latas de aluminio y botellas de vidrio. El resto de la caja es para papel y cartón secos.",
      "También encontrarás un pequeño recipiente verde para restos de comida. Todo lo demás debe ir en una bolsa de basura, que debe colocarse en el gran contenedor verde.",
    ],
    arrivalWcIncluded:
      "El acceso al WC y a la ducha interior se ha añadido a tu estancia. Está disponible bajo petición cuando estamos en el lugar, normalmente entre las 7:00 y las 21:00.",
    arrivalWcUpsell:
      "El acceso al WC y a la ducha interior está disponible bajo petición entre las 7:00 y las 21:00 cuando estamos en el lugar. Este servicio opcional cuesta 10 CHF por las 7 primeras noches, luego 10 CHF por semana adicional. Contáctanos para comprobar la disponibilidad.",
    arrivalEvCharge:
      "También puedes cargar tu coche eléctrico si lo necesitas y estamos en el lugar. Proporcionamos un cable compatible con el enchufe Type 13 suizo (220 V, 10 A) y equipado con un conector Type 2. Este servicio de carga lenta está disponible con cargo adicional (CHF 15 por 10h, CHF 30 por todo el día o la noche).",
    arrivalSupport:
      `A tu llegada y durante toda tu estancia, Cédric estará disponible para ayudarte a través de este sistema de mensajería o por WhatsApp __WHATSAPP_LINE__`,
    pleasantStay: "Te deseamos una estancia agradable.",
  },
  pt: {
    localeTag: "pt-PT",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "estadia no estacionamento",
    bookingLabelStudio: "estadia no estúdio",
    subjects: {
      booking_confirmation: "confirmação da reserva",
      booking_modification: "reserva atualizada",
      booking_cancellation: "reserva cancelada",
      arrival_instructions: "informações de chegada",
      departure_instructions: "informações de partida",
      review_request: "Como foi a sua estadia no C&C?",
      payment_reminder: "lembrete de pagamento",
      payment_expired: "reserva expirada",
    },
    reviewBody: `Olá __FIRST_NAME__,

Agradecemos a sua estadia connosco!

A sua avaliação ajuda os futuros viajantes a encontrar o lugar certo, e significa muito para a nossa pequena empresa familiar.

Se tiver um momento, gostaríamos muito de saber a sua opinião:
Deixe uma avaliação → __REVIEW_LINK__

Boa viagem,
Céline e Cédric`,
    greeting: (name) => `Olá ${name},`,
    confirmationCreated: (label) => `Obrigado. A sua reserva de ${label} foi criada.`,
    referenceLabel: "Referência",
    arrivalLabel: "Chegada",
    departureLabel: "Partida",
    totalLabel: "Total",
    between: "entre",
    and: "e",
    by: "até",
    paymentPendingNotice:
      "Se o pagamento ainda não tiver sido concluído, utilize a ligação de pagamento apresentada após a reserva ou contacte-nos se necessário.",
    paymentReminderIntro:
      "Estamos a reservar as suas datas ({dates}), mas o pagamento continua pendente.",
    paymentReminderDeadline:
      "Por favor, conclua o pagamento o mais depressa possível; caso contrário, as suas datas podem ser libertadas e reservadas por outra pessoa.",
    paymentExpiredIntro:
      "O pagamento da reserva {reference} não foi concluído a tempo e as datas ({dates}) foram libertadas.",
    paymentExpiredReopen:
      "Ainda pode concluir o pagamento a partir da sua ligação de gestão se as datas ainda estiverem disponíveis; caso contrário, teremos todo o prazer em ajudá-lo a encontrar novas datas.",
    indoorAccessNotice:
      "O acesso ao WC e ao duche interior está disponível mediante pedido, apenas quando estamos no local, entre as 7h00 e as 21h00.",
    indoorAccessUpsell:
      "Este serviço opcional custa CHF 10 pelas 7 primeiras noites, depois CHF 10 por semana adicional.",
    manageReservation: "Gerir a sua reserva",
    supportLine:
      `Cédric está disponível se necessário através deste sistema de mensagens ou por WhatsApp __WHATSAPP_LINE__ (apenas mensagens)`,
    confirmationClose: "Estamos ansiosos por recebê-lo.",
    confirmationSignoff: "Até breve,",
    arrivalStudioIntro: "Estamos ansiosos por recebê-lo.",
    arrivalAssistance:
      `Se precisar de ajuda antes da chegada, Cédric está disponível através deste sistema de mensagens ou por WhatsApp __WHATSAPP_LINE__ (apenas mensagens)`,
    kindRegards: "Com os melhores cumprimentos,",
    updatedReservation: "A sua reserva foi atualizada.",
    updatedTotalLabel: "Novo total",
    additionalPayment: (amount) =>
      `É necessário um pagamento adicional de ${amount} para confirmar esta alteração.`,
    refundDue: (amount) =>
      `É devido um reembolso de ${amount} após a sua alteração.`,
    noChangeAmount: "Esta alteração não muda o valor total.",
    cancelledReservation: "A sua reserva foi cancelada.",
    cancelledOnLabel: "Cancelada em",
    refundManual: "Se houver um reembolso a fazer, iremos processá-lo manualmente assim que possível.",
    parkingArrivalIntro: "Esperamos que esteja bem.",
    arrivalParkingLines: [
      'Pode encontrar o local pesquisando "C&C motorhome/RV/van/camping-car parking space" no Google Maps.',
      "Quando chegar, pode estacionar o seu veículo mesmo em frente à garagem.",
      "O terraço em cima da garagem é para si.",
      "Existem almofadas vermelhas disponíveis para usar nos paletes de madeira do terraço. Pode encontrá-las na garagem. Devem ser guardadas novamente na garagem antes do anoitecer ou em caso de chuva.",
      "__GARAGE_INSTRUCTIONS__",
      'Para o Wi-Fi em frente à garagem, utilize a rede "candc-studio". A palavra-passe é "__WIFI_STUDIO_PASSWORD__".',
      'No terraço, a melhor rede é "candc".',
      "Aqui está a palavra-passe:",
      "__WIFI_TERRACE_PASSWORD__",
      "Encontrará um cabo elétrico com uma ficha suíça normal de 220 V (3 pinos) sob a porta da garagem, ou no lado direito dentro da garagem, a cerca de 1 m de altura.",
      "A torneira de água está visível perto da grande caixa cinzenta, no canto.",
      "NÃO dispomos de infraestrutura para águas negras (águas residuais do sistema de sanita). Terá de ir a um parque de campismo próximo para isso.",
      "Pode usar alguma lenha para acender um churrasco no brasero, que está disponível se desejar.",
      "Do lado esquerdo da entrada encontrará uma grande caixa cinzenta para materiais recicláveis. Há opções separadas para garrafas PET, latas de alumínio e garrafas de vidro. O resto da caixa é para papel e cartão secos.",
      "Também encontrará um pequeno recipiente verde para restos de comida. Tudo o resto deve ser colocado num saco do lixo, que deverá ir para o grande contentor verde.",
    ],
    arrivalWcIncluded:
      "O acesso ao WC e ao duche interior foi adicionado à sua estadia. Está disponível mediante pedido quando estamos no local, normalmente entre as 7h00 e as 21h00.",
    arrivalWcUpsell:
      "O acesso ao WC e ao duche interior está disponível mediante pedido entre as 7h00 e as 21h00 quando estamos no local. Este serviço opcional custa CHF 10 pelas 7 primeiras noites, depois CHF 10 por semana adicional. Contacte-nos para verificar a disponibilidade.",
    arrivalEvCharge:
      "Também pode carregar o seu carro elétrico se necessário, quando estamos no local. Fornecemos um cabo compatível com a tomada suíça Type 13 (220 V, 10 A) e equipado com um conector Type 2. Este serviço de carregamento lento está disponível mediante custo adicional (CHF 15 por 10h, CHF 30 por todo o dia ou noite).",
    arrivalSupport:
      `À sua chegada e durante toda a estadia, Cédric estará disponível para ajudar através deste sistema de mensagens ou por WhatsApp __WHATSAPP_LINE__`,
    pleasantStay: "Desejamos-lhe uma excelente estadia.",
  },
  it: {
    localeTag: "it-CH",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "soggiorno nel parcheggio",
    bookingLabelStudio: "soggiorno nello studio",
    subjects: {
      booking_confirmation: "conferma di prenotazione",
      booking_modification: "prenotazione aggiornata",
      booking_cancellation: "prenotazione annullata",
      arrival_instructions: "informazioni di arrivo",
      departure_instructions: "informazioni di partenza",
      review_request: "Com'è andato il tuo soggiorno al C&C?",
      payment_reminder: "promemoria di pagamento",
      payment_expired: "prenotazione scaduta",
    },
    reviewBody: `Ciao __FIRST_NAME__,

Grazie per aver soggiornato da noi!

La tua recensione aiuta i futuri viaggiatori a trovare il posto giusto, e significa molto per la nostra piccola impresa familiare.

Se hai un momento, ci farebbe piacere conoscere la tua opinione:
Lascia una recensione → __REVIEW_LINK__

Buon viaggio,
Céline e Cédric`,
    greeting: (name) => `Ciao ${name},`,
    confirmationCreated: (label) => `Grazie. La tua prenotazione per il ${label} è stata creata.`,
    referenceLabel: "Riferimento",
    arrivalLabel: "Arrivo",
    departureLabel: "Partenza",
    totalLabel: "Totale",
    between: "tra le",
    and: "e",
    by: "entro le",
    paymentPendingNotice:
      "Se il pagamento non è ancora stato completato, utilizza il link di pagamento mostrato dopo la prenotazione oppure contattaci se necessario.",
    paymentReminderIntro:
      "Stiamo riservando le tue date ({dates}), ma il pagamento è ancora in sospeso.",
    paymentReminderDeadline:
      "Completa il pagamento il prima possibile; altrimenti le tue date potrebbero essere liberate e prenotate da qualcun altro.",
    paymentExpiredIntro:
      "Il pagamento della prenotazione {reference} non è stato completato in tempo e le date ({dates}) sono state liberate.",
    paymentExpiredReopen:
      "Puoi ancora completare il pagamento dal tuo link di gestione se le date sono ancora disponibili; altrimenti saremo felici di aiutarti a trovare nuove date.",
    indoorAccessNotice:
      "L'accesso al WC e alla doccia interna è disponibile su richiesta, solo quando siamo sul posto, tra le 7:00 e le 21:00.",
    indoorAccessUpsell:
      "Questo servizio opzionale costa CHF 10 per le prime 7 notti, poi CHF 10 a settimana aggiuntiva.",
    manageReservation: "Gestisci la tua prenotazione",
    supportLine:
      `Cédric è disponibile se necessario tramite questo sistema di messaggistica o via WhatsApp __WHATSAPP_LINE__ (solo messaggi)`,
    confirmationClose: "Non vediamo l'ora di accoglierti.",
    confirmationSignoff: "A presto,",
    arrivalStudioIntro: "Non vediamo l'ora di accoglierti.",
    arrivalAssistance:
      `Se hai bisogno di assistenza prima dell'arrivo, Cédric è disponibile tramite questo sistema di messaggistica o via WhatsApp __WHATSAPP_LINE__ (solo messaggi)`,
    kindRegards: "Cordiali saluti,",
    updatedReservation: "La tua prenotazione è stata aggiornata.",
    updatedTotalLabel: "Nuovo totale",
    additionalPayment: (amount) =>
      `È richiesto un pagamento aggiuntivo di ${amount} per confermare questa modifica.`,
    refundDue: (amount) =>
      `È dovuto un rimborso di ${amount} in seguito alla tua modifica.`,
    noChangeAmount: "Questa modifica non cambia l'importo totale.",
    cancelledReservation: "La tua prenotazione è stata annullata.",
    cancelledOnLabel: "Annullata il",
    refundManual: "Se è dovuto un rimborso, lo elaboreremo manualmente il prima possibile.",
    parkingArrivalIntro: "Speriamo che tu stia bene.",
    arrivalParkingLines: [
      'Puoi trovare il posto cercando "C&C motorhome/RV/van/camping-car parking space" su Google Maps.',
      "Quando arrivi, puoi parcheggiare il tuo veicolo proprio davanti al garage.",
      "La terrazza sopra il garage è a tua disposizione.",
      "Sono disponibili cuscini rossi da usare sui pallet di legno della terrazza. Li trovi nel garage. Devono essere riposti nel garage prima della notte o in caso di pioggia.",
      "__GARAGE_INSTRUCTIONS__",
      'Per il Wi-Fi davanti al garage, usa la rete "candc-studio". La password è "__WIFI_STUDIO_PASSWORD__".',
      'Sulla terrazza la rete migliore è "candc".',
      "Ecco la password:",
      "__WIFI_TERRACE_PASSWORD__",
      "Troverai un cavo elettrico con una normale spina svizzera da 220 V (3 pin) sotto la porta del garage, oppure sul lato destro all'interno del garage, a circa 1 m di altezza.",
      "Il rubinetto dell'acqua è visibile vicino alla grande scatola grigia, nell'angolo.",
      "NON disponiamo di infrastrutture per le acque nere (acque reflue del sistema toilette). Dovrai recarti in un campeggio vicino per questo.",
      "Puoi prendere un po' di legna per accendere un barbecue sul braciere, messo a disposizione se lo desideri.",
      "Sul lato sinistro dell'ingresso troverai una grande scatola grigia per i materiali riciclabili. Ci sono sezioni separate per bottiglie PET, lattine di alluminio e bottiglie di vetro. Il resto della scatola è destinato a carta e cartone asciutti.",
      "Troverai anche un piccolo contenitore verde per i resti di cibo. Tutto il resto va messo in un sacco della spazzatura da depositare nel grande contenitore verde.",
    ],
    arrivalWcIncluded:
      "L'accesso al WC e alla doccia interna è stato aggiunto al tuo soggiorno. È disponibile su richiesta quando siamo sul posto, di solito tra le 7:00 e le 21:00.",
    arrivalWcUpsell:
      "L'accesso al WC e alla doccia interna è disponibile su richiesta tra le 7:00 e le 21:00 quando siamo sul posto. Questo servizio opzionale costa CHF 10 per le prime 7 notti, poi CHF 10 a settimana aggiuntiva. Contattaci per verificare la disponibilità.",
    arrivalEvCharge:
      "Puoi anche ricaricare la tua auto elettrica se necessario, quando siamo sul posto. Forniamo un cavo compatibile con la presa svizzera Type 13 (220 V, 10 A) dotato di connettore Type 2. Questo servizio di ricarica lenta è disponibile con un supplemento (CHF 15 per 10h, CHF 30 per l'intera giornata o notte).",
    arrivalSupport:
      `Al tuo arrivo e durante tutto il soggiorno, Cédric sarà disponibile per assisterti tramite questo sistema di messaggistica o via WhatsApp __WHATSAPP_LINE__`,
    pleasantStay: "Ti auguriamo un piacevole soggiorno.",
  },
  nl: {
    localeTag: "nl-NL",
    subjectPrefixParking: "C&C Parking",
    subjectPrefixStudio: "C&C Studio",
    bookingLabelParking: "verblijf op de parkeerplaats",
    bookingLabelStudio: "verblijf in de studio",
    subjects: {
      booking_confirmation: "boekingsbevestiging",
      booking_modification: "boeking bijgewerkt",
      booking_cancellation: "boeking geannuleerd",
      arrival_instructions: "aankomstinformatie",
      departure_instructions: "vertrekinformatie",
      review_request: "Hoe was uw verblijf bij C&C?",
      payment_reminder: "betalingsherinnering",
      payment_expired: "reservering verlopen",
    },
    reviewBody: `Beste __FIRST_NAME__,

Bedankt voor uw verblijf bij ons!

Uw recensie helpt toekomstige reizigers de juiste plek te vinden, en betekent veel voor onze kleine familieonderneming.

Als u even tijd heeft, horen we graag uw mening:
Laat een recensie achter → __REVIEW_LINK__

Een goede reis gewenst,
Céline en Cédric`,
    greeting: (name) => `Hallo ${name},`,
    confirmationCreated: (label) => `Bedankt. Je reservering voor het ${label} is aangemaakt.`,
    referenceLabel: "Referentie",
    arrivalLabel: "Aankomst",
    departureLabel: "Vertrek",
    totalLabel: "Totaal",
    between: "tussen",
    and: "en",
    by: "uiterlijk",
    paymentPendingNotice:
      "Als de betaling nog niet is voltooid, gebruik dan de betaallink die na het boeken werd getoond of neem contact met ons op indien nodig.",
    paymentReminderIntro:
      "We houden je datums ({dates}) voor je vast, maar de betaling is nog in behandeling.",
    paymentReminderDeadline:
      "Voltooi de betaling zo snel mogelijk; anders kunnen je datums worden vrijgegeven en door iemand anders worden geboekt.",
    paymentExpiredIntro:
      "De betaling voor reservering {reference} is niet op tijd voltooid en de datums ({dates}) zijn vrijgegeven.",
    paymentExpiredReopen:
      "Je kunt de betaling nog steeds voltooien via je beheerlink als de datums nog beschikbaar zijn; anders helpen we je graag nieuwe datums te vinden.",
    indoorAccessNotice:
      "Toegang tot het binnentoilet en de douche is op aanvraag beschikbaar, alleen wanneer wij aanwezig zijn, tussen 7.00 en 21.00 uur.",
    indoorAccessUpsell:
      "Deze optionele service kost CHF 10 voor de eerste 7 nachten, daarna CHF 10 per extra week.",
    manageReservation: "Beheer je reservering",
    supportLine:
      `Cédric is indien nodig bereikbaar via dit berichtensysteem of via WhatsApp __WHATSAPP_LINE__ (alleen berichten)`,
    confirmationClose: "We kijken ernaar uit je te ontmoeten.",
    confirmationSignoff: "Tot binnenkort,",
    arrivalStudioIntro: "We kijken ernaar uit je te verwelkomen.",
    arrivalAssistance:
      `Als je voor aankomst hulp nodig hebt, is Cédric bereikbaar via dit berichtensysteem of via WhatsApp __WHATSAPP_LINE__ (alleen berichten)`,
    kindRegards: "Met vriendelijke groet,",
    updatedReservation: "Je reservering is bijgewerkt.",
    updatedTotalLabel: "Nieuw totaal",
    additionalPayment: (amount) =>
      `Een extra betaling van ${amount} is nodig om deze wijziging te bevestigen.`,
    refundDue: (amount) =>
      `Er is een terugbetaling van ${amount} verschuldigd na je wijziging.`,
    noChangeAmount: "Deze wijziging verandert het totaalbedrag niet.",
    cancelledReservation: "Je reservering is geannuleerd.",
    cancelledOnLabel: "Geannuleerd op",
    refundManual: "Als er een terugbetaling verschuldigd is, verwerken we die zo snel mogelijk handmatig.",
    parkingArrivalIntro: "We hopen dat alles goed met je gaat.",
    arrivalParkingLines: [
      'Je kunt de plaats vinden door in Google Maps te zoeken naar "C&C motorhome/RV/van/camping-car parking space".',
      "Bij aankomst kun je je voertuig net voor de garage parkeren.",
      "Het terras boven op de garage is voor jou.",
      "Er zijn rode kussens beschikbaar voor gebruik op de houten pallets van het terras. Je vindt ze in de garage. Leg ze voor het donker wordt of bij regen weer terug in de garage.",
      "__GARAGE_INSTRUCTIONS__",
      'Voor de wifi voor de garage gebruik je het netwerk "candc-studio". Het wachtwoord is "__WIFI_STUDIO_PASSWORD__".',
      'Op het terras is het beste netwerk "candc".',
      "Hier is het wachtwoord:",
      "__WIFI_TERRACE_PASSWORD__",
      "Je vindt een elektrische kabel met een normale Zwitserse 220 V-stekker (3 pinnen) onder de garagedeur of aan de rechterkant binnen in de garage, ongeveer 1 m hoog.",
      "De waterkraan is zichtbaar bij de grote grijze box in de hoek.",
      "Wij hebben GEEN infrastructuur voor zwart water (afvalwater van het toiletsysteem). Daarvoor moet je naar een nabijgelegen camping gaan.",
      "Je mag wat hout nemen om een barbecue aan te steken op de brasero, die beschikbaar is als je dat wilt.",
      "Aan de linkerkant van de ingang vind je een grote grijze box voor recycleerbare materialen. Er zijn aparte vakken voor PET-flessen, aluminium blikjes en glazen flessen. De rest van de box is voor droog papier en karton.",
      "Je vindt ook een kleine groene bak voor voedselresten. Al het andere moet in een vuilniszak die in de grote groene container moet worden geplaatst.",
    ],
    arrivalWcIncluded:
      "Toegang tot het binnentoilet en de douche is toegevoegd aan je verblijf. Het is op aanvraag beschikbaar wanneer wij aanwezig zijn, meestal tussen 7.00 en 21.00 uur.",
    arrivalWcUpsell:
      "Toegang tot het binnentoilet en de douche is op aanvraag beschikbaar tussen 7.00 en 21.00 uur wanneer wij aanwezig zijn. Deze optionele service kost CHF 10 voor de eerste 7 nachten, daarna CHF 10 per extra week. Neem contact met ons op om de beschikbaarheid te controleren.",
    arrivalEvCharge:
      "Je kunt ook je elektrische auto opladen als dat nodig is, wanneer wij aanwezig zijn. Wij leveren een kabel die compatibel is met de Zwitserse Type 13-aansluiting (220 V, 10 A) en voorzien is van een Type 2-connector. Deze langzame oplaadservice is beschikbaar tegen een extra vergoeding (CHF 15 voor 10u, CHF 30 voor de hele dag of nacht).",
    arrivalSupport:
      `Bij je aankomst en tijdens je hele verblijf zal Cédric beschikbaar zijn via dit berichtensysteem of via WhatsApp __WHATSAPP_LINE__`,
    pleasantStay: "We wensen je een aangenaam verblijf.",
  },
};

function normalizeLocale(locale) {
  const base = String(locale || "en").toLowerCase().split("-")[0];
  return EMAIL_I18N[base] ? base : "en";
}

function getEmailText(locale) {
  return EMAIL_I18N[normalizeLocale(locale)];
}

function formatMoney(amount, currency = "CHF", locale = "en") {
  return new Intl.NumberFormat(getEmailText(locale).localeTag, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatDateForLocale(isoDate, locale) {
  const date = parseIsoDate(isoDate);
  return new Intl.DateTimeFormat(getEmailText(locale).localeTag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function manageUrl(config, token) {
  return `${config.publicBaseUrl}/booking/manage/${token}`;
}

function bookingLabel(reservation, text) {
  return reservation.unit_type === "studio" ? text.bookingLabelStudio : text.bookingLabelParking;
}

function buildConfirmationText(reservation, token, includeWcUpsell) {
  const text = getEmailText(reservation.locale);

  if (reservation.unit_type === "studio") {
    const template = text.studioConfirmationBody || getEmailText("en").studioConfirmationBody || "";
    const manageLine = `${text.manageReservation}: ${token}`;

    return template
      .replaceAll("__FIRST_NAME__", reservation.guest_first_name)
      .replaceAll("__LAST_NAME__", reservation.guest_last_name || "")
      .replaceAll("__MANAGE_LINK__", manageLine);
  }

  const lines = [
    text.greeting(reservation.guest_first_name),
    "",
    text.confirmationCreated(bookingLabel(reservation, text)),
    "",
    `${text.referenceLabel}: ${reservation.public_reference}`,
    `${text.arrivalLabel}: ${formatDateForLocale(reservation.check_in_date, reservation.locale)} ${text.between} ${reservation.check_in_start_time.slice(0, 5)} ${text.and} ${reservation.check_in_end_time.slice(0, 5)}`,
    `${text.departureLabel}: ${formatDateForLocale(reservation.check_out_date, reservation.locale)} ${text.by} ${reservation.check_out_time.slice(0, 5)}`,
    `${text.totalLabel}: ${formatMoney(reservation.total_amount, reservation.currency, reservation.locale)}`,
    "",
  ];

  if (reservation.payment_status && reservation.payment_status !== "paid") {
    lines.push(text.paymentPendingNotice, "");
  }

  if (reservation.unit_type === "parking") {
    lines.push(text.indoorAccessNotice);
  }

  if (includeWcUpsell && reservation.unit_type === "parking") {
    lines.push(text.indoorAccessUpsell);
  }

  lines.push(
    "",
    `${text.manageReservation}: ${token}`,
    "",
    text.supportLine,
    "",
    text.confirmationClose,
    "",
    text.confirmationSignoff,
    "Celine and Cedric",
  );

  return lines.join("\n");
}

function buildArrivalText(reservation, config = {}, manageToken = null) {
  const text = getEmailText(reservation.locale);
  const manageLine = manageToken ? `${text.manageReservation}: ${manageUrl(config, manageToken)}` : "";

  if (reservation.unit_type !== "parking") {
    const template = text.studioArrivalBody || getEmailText("en").studioArrivalBody || "";

    return template
      .replaceAll("__FIRST_NAME__", reservation.guest_first_name)
      .replaceAll("__LAST_NAME__", reservation.guest_last_name || "")
      .replaceAll("__MANAGE_LINK__", manageLine);
  }

  const lines = [
    text.greeting(reservation.guest_first_name),
    "",
    text.parkingArrivalIntro,
    "",
  ];

  for (const line of text.arrivalParkingLines) {
    lines.push(line, "");
  }

  if (reservation.wc_shower_requested) {
    lines.push(text.arrivalWcIncluded, "");
  } else {
    lines.push(text.arrivalWcUpsell, "");
  }

  lines.push(
    text.arrivalEvCharge,
    "",
    text.arrivalSupport,
    "",
  );

  if (manageLine) {
    lines.push(manageLine, "");
  }

  lines.push(
    text.pleasantStay,
    "",
    text.kindRegards,
    "Celine and Cedric",
  );

  return lines.join("\n");
}

function buildModificationText(reservation, deltaAmount, manageLink) {
  const text = getEmailText(reservation.locale);
  const amountLabel = deltaAmount > 0
    ? text.additionalPayment(formatMoney(deltaAmount, reservation.currency, reservation.locale))
    : deltaAmount < 0
      ? text.refundDue(formatMoney(Math.abs(deltaAmount), reservation.currency, reservation.locale))
      : text.noChangeAmount;

  return [
    text.greeting(reservation.guest_first_name),
    "",
    text.updatedReservation,
    "",
    `${text.referenceLabel}: ${reservation.public_reference}`,
    `${text.arrivalLabel}: ${formatDateForLocale(reservation.check_in_date, reservation.locale)}`,
    `${text.departureLabel}: ${formatDateForLocale(reservation.check_out_date, reservation.locale)}`,
    `${text.updatedTotalLabel}: ${formatMoney(reservation.total_amount, reservation.currency, reservation.locale)}`,
    amountLabel,
    "",
    `${text.manageReservation}: ${manageLink}`,
    "",
    text.kindRegards,
    "Celine and Cedric",
  ].join("\n");
}

function buildCancellationText(reservation) {
  const text = getEmailText(reservation.locale);

  return [
    text.greeting(reservation.guest_first_name),
    "",
    text.cancelledReservation,
    "",
    `${text.referenceLabel}: ${reservation.public_reference}`,
    `${text.cancelledOnLabel}: ${formatDateForLocale(formatIsoDate(new Date()), reservation.locale)}`,
    "",
    text.refundManual,
    "",
    text.kindRegards,
    "Celine and Cedric",
  ].join("\n");
}

function formatStayDates(reservation) {
  return `${formatDateForLocale(reservation.check_in_date, reservation.locale)} → ${formatDateForLocale(reservation.check_out_date, reservation.locale)}`;
}

function maskIdDocument(value) {
  // Conformité LPD / RGPD : le n° de pièce d'identité n'est jamais transmis
  // en clair dans les e-mails — seuls les 4 derniers caractères sont visibles.
  const raw = String(value || "").trim();
  if (!raw) {
    return "—";
  }
  if (raw.length <= 4) {
    return "••••";
  }
  return `••••••••${raw.slice(-4)}`;
}

function parseAdditionalGuests(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Alerte e-mail dédiée à l'admin (ADMIN_NOTIFICATION_EMAIL) à la création
// d'une réservation, en complément du CC automatique du mail client.
// Contient les coordonnées complètes du voyageur mais jamais le n° de pièce
// d'identité en clair (masqué — cf. LPD / RGPD).
function buildAdminNewBookingPayload(reservation, config, options = {}) {
  const unitLabel = reservation.unit_display_name || reservation.unit_code || reservation.unit_type || "réservation";
  const additionalGuests = parseAdditionalGuests(reservation.additional_guests_json)
    .map((guest) => [guest.firstName, guest.lastName].filter(Boolean).join(" "))
    .filter(Boolean);

  const lines = [
    `Nouvelle réservation créée sur ${config.publicBaseUrl}`,
    "",
    `Référence : ${reservation.public_reference}`,
    `Unité : ${unitLabel}`,
    `Dates : ${reservation.check_in_date} → ${reservation.check_out_date}`,
    `Statut : ${reservation.payment_status === "paid" ? "payée" : "en attente de paiement"}`,
    `Total : ${formatMoney(reservation.total_amount, reservation.currency, "fr")}`,
    "",
    "Client",
    `Nom : ${reservation.guest_first_name} ${reservation.guest_last_name || ""}`.trimEnd(),
    `Email : ${reservation.guest_email}`,
    `Téléphone mobile : ${reservation.guest_mobile_phone || reservation.guest_phone || "—"}`,
    `Adresse : ${[reservation.guest_address_street, reservation.guest_address_zip, reservation.guest_address_city, reservation.guest_address_country].filter(Boolean).join(", ") || "—"}`,
    `Date de naissance : ${reservation.guest_date_of_birth || "—"}`,
    `Nationalité : ${reservation.guest_nationality || "—"}`,
    `N° de pièce d'identité : ${maskIdDocument(reservation.guest_id_document_number)} (masqué — n° complet visible uniquement dans l'interface admin)`,
  ];

  if (additionalGuests.length > 0) {
    lines.push(`Invités additionnels : ${additionalGuests.join(", ")}`);
  }

  if (reservation.remarks) {
    lines.push(`Remarques : ${reservation.remarks}`);
  }

  lines.push(
    "",
    `Lien de gestion : ${options.manageToken ? manageUrl(config, options.manageToken) : "—"}`,
  );

  return {
    subject: `Nouvelle réservation ${reservation.public_reference} — ${unitLabel}`,
    text: lines.join("\n"),
  };
}

function buildPaymentReminderText(reservation, manageLink) {
  const text = getEmailText(reservation.locale);

  return [
    text.greeting(reservation.guest_first_name),
    "",
    text.paymentReminderIntro.replace("{dates}", formatStayDates(reservation)),
    "",
    text.paymentReminderDeadline,
    "",
    `${text.manageReservation}: ${manageLink}`,
    "",
    text.supportLine,
    "",
    text.kindRegards,
    "Celine and Cedric",
  ].join("\n");
}

function buildPaymentExpiredText(reservation, manageLink) {
  const text = getEmailText(reservation.locale);

  return [
    text.greeting(reservation.guest_first_name),
    "",
    text.paymentExpiredIntro
      .replace("{reference}", reservation.public_reference)
      .replace("{dates}", formatStayDates(reservation)),
    "",
    text.paymentExpiredReopen,
    "",
    `${text.manageReservation}: ${manageLink}`,
    "",
    text.supportLine,
    "",
    text.kindRegards,
    "Celine and Cedric",
  ].join("\n");
}

function buildDepartureText(reservation) {
  if (reservation.unit_type !== "studio") {
    throw new Error("departure_email_studio_only");
  }

  const text = getEmailText(reservation.locale);
  const template = text.departureBody || getEmailText("en").departureBody || "";

  return template
    .replaceAll("__FIRST_NAME__", reservation.guest_first_name)
    .replaceAll("__CHECKOUT_CLOSE_TIME__", reservation.check_out_time ? reservation.check_out_time.slice(0, 5) : "10:00");
}

function buildReviewRequestText(reservation) {
  const text = getEmailText(reservation.locale);
  const template = text.reviewBody || getEmailText("en").reviewBody || "";

  return template
    .replaceAll("__FIRST_NAME__", reservation.guest_first_name);
}

function isUnsetValue(value) {
  return !value || /^REPLACE_WITH_/i.test(String(value).trim());
}

function parseGarageInstructions(raw) {
  if (!raw || /^REPLACE_WITH_/i.test(String(raw).trim())) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveLocalizedValue(raw, locale) {
  // Accepte soit une chaine simple, soit un objet JSON cle par langue
  // (ex. `{"fr": "...", "en": "..."}`). Pour le JSON, retombe sur
  // l'entree anglaise puis sur une chaine vide.
  if (raw && !/^REPLACE_WITH_/i.test(String(raw).trim())) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed[normalizeLocale(locale)] || parsed.en || "";
      }
    } catch {
      // Pas du JSON : valeur chaine simple.
    }
  }
  return isUnsetValue(raw) ? "" : raw;
}

function applyPlaceholders(text, config, locale, reservation = null) {
  const garageMap = parseGarageInstructions(config.garageInstructionsJson);
  const garageInstruction = garageMap[normalizeLocale(locale)] || "";

  const result = text
    .replaceAll("__WIFI_STUDIO_PASSWORD__", isUnsetValue(config.wifiStudioPassword) ? "" : config.wifiStudioPassword)
    .replaceAll("__WIFI_TERRACE_PASSWORD__", isUnsetValue(config.wifiTerracePassword) ? "" : config.wifiTerracePassword)
    .replaceAll("__GARAGE_INSTRUCTIONS__", garageInstruction)
    .replaceAll("__KEY_BOX_STUDIO_CODE__", isUnsetValue(config.keyBoxStudioCode) ? "" : config.keyBoxStudioCode)
    .replaceAll("__WHATSAPP_LINE__", isUnsetValue(config.whatsappLine) ? "" : config.whatsappLine)
    .replaceAll("__STUDIO_ADDRESS__", resolveLocalizedValue(config.studioAddress, locale))
    .replaceAll(
      "__REVIEW_LINK__",
      reservation?.unit_type === "studio" ? config.reviewLinkStudio : config.reviewLinkParking,
    );

  // Remove any leftover template placeholders (missing config values).
  return result.replace(/__[A-Z][A-Z_]*__/g, "");
}

function buildEmailPayload(type, reservation, config, options = {}) {
  const text = getEmailText(reservation.locale);
  const subjectPrefix = reservation.unit_type === "studio"
    ? text.subjectPrefixStudio
    : text.subjectPrefixParking;
  const manageLink = options.manageToken ? manageUrl(config, options.manageToken) : null;

  let rawText;
  switch (type) {
    case "booking_confirmation":
      rawText = buildConfirmationText(
        reservation,
        manageLink,
        !reservation.wc_shower_requested && reservation.unit_type === "parking",
      );
      break;
    case "booking_modification":
      rawText = buildModificationText(reservation, options.deltaAmount || 0, manageLink || "-");
      break;
    case "booking_cancellation":
      rawText = buildCancellationText(reservation);
      break;
    case "arrival_instructions":
      rawText = buildArrivalText(reservation, config, options.manageToken || null);
      break;
    case "departure_instructions":
      rawText = buildDepartureText(reservation);
      break;
    case "review_request":
      rawText = buildReviewRequestText(reservation);
      break;
    case "payment_reminder":
      rawText = buildPaymentReminderText(reservation, manageLink || "-");
      break;
    case "payment_expired":
      rawText = buildPaymentExpiredText(reservation, manageLink || "-");
      break;
    case "admin_new_booking":
      // Alerte dédiée à l'admin : contenu français indépendant de la langue
      // du voyageur, coordonnées complètes mais n° de pièce d'identité masqué.
      return buildAdminNewBookingPayload(reservation, config, options);
    default:
      throw new Error(`unknown_email_type:${type}`);
  }

  const subject = type === "review_request"
    ? text.subjects[type]
    : `${subjectPrefix} ${text.subjects[type]} - ${reservation.public_reference}`;

  return {
    subject,
    text: applyPlaceholders(rawText, config, reservation.locale, reservation),
  };
}

export function isEmailConfigured(env) {
  const config = getConfig(env);
  return Boolean(config.resendApiKey && config.emailFrom);
}

export async function sendTransactionalEmail(env, type, reservation, options = {}) {
  const config = getConfig(env);

  if (!isEmailConfigured(env)) {
    throw new Error("email_not_configured");
  }

  const { subject, text } = buildEmailPayload(type, reservation, config, options);
  const to = options.to || reservation.guest_email;
  // `cc: false` permet d'envoyer un e-mail strictement à l'admin sans le CC
  // automatique (évite un doublon quand `to` est déjà l'adresse admin).
  const cc = options.cc === false ? null : options.cc || config.adminNotificationEmail || null;
  const headers = {
    authorization: `Bearer ${config.resendApiKey}`,
    "content-type": "application/json",
  };
  const body = {
    from: config.emailFrom,
    to: [to],
    subject,
    text,
  };

  if (cc) {
    body.cc = [cc];
  }

  if (config.emailReplyTo) {
    body.reply_to = config.emailReplyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`email_send_failed:${response.status}:${await response.text()}`);
  }

  return response.json();
}
